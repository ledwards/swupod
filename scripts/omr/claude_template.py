#!/usr/bin/env python3
"""
Claude-discovered template approach.

For each detected table, ask Claude to output the y-coordinate of each
row in the image. Use those coordinates for pixel-precise per-cell
cropping. Then either use simple threshold OR ask Claude per-cell.

Hypothesis: Claude can read out row positions accurately enough to
beat the auto-detected grid lines.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))
try:
    from dotenv import load_dotenv
    load_dotenv(REPO / ".env")
    load_dotenv(REPO / ".env.local", override=True)
except ImportError:
    pass

import anthropic  # noqa: E402
from whole_table import MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, PRICING, encode_table_image  # noqa: E402


SYSTEM_PROMPT_DISCOVER = """You analyze a registration-table image and output a single JSON object describing every cell's position and content.

For each card row in the table, output:
  - n: card number printed in the NO. # column
  - p: tally count in PLAYED column (leftmost data column) — 0/1/2/3/4
  - t: tally count in TOTAL column (second column) — 0/1/2/3/4

Reading rules:
- Empty cell = 0
- "|" or "✓" or digit "1" = 1; "||" or "2" = 2; etc.
- Printed card number is NOT a mark.
- Smudges/erasures: report your best read.
- Process EVERY printed card row in this table image.

Output strictly:
{"rows": [{"n": int, "p": int, "t": int}, ...]}"""


async def classify_one_table(client, table_name, expected_cards, image_b64, model):
    """Single-shot table classification, optimized prompt."""
    sorted_cards = sorted(expected_cards, key=lambda c: int(c["number"]))
    name_index = "\n".join(
        f"  #{c['number']:>3} {c['name']}" + (f" — {c['subtitle']}" if c.get('subtitle') else "")
        for c in sorted_cards
    )
    user_text = (
        f"Table: {table_name}\n\n"
        f"Expected cards in this table (use as closed vocabulary):\n{name_index}\n\n"
        f"Output JSON for ALL of these card numbers in numerical order. "
        f"If you cannot find a card row in the image, report it as 0/0."
    )
    kwargs = dict(
        model=model, max_tokens=4500,
        system=[{"type": "text", "text": SYSTEM_PROMPT_DISCOVER, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                {"type": "text", "text": user_text},
            ],
        }],
    )
    response = await client.messages.create(**kwargs)
    raw = response.content[0].text if response.content else ""
    parsed = {}
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            payload = json.loads(m.group(0))
            for row in payload.get("rows", []):
                n = int(row["n"])
                p = int(row.get("p", 0))
                t = int(row.get("t", 0))
                parsed[n] = (t, p)
        except Exception:
            pass
    usage = response.usage
    return {
        "table": table_name,
        "parsed": parsed,
        "raw": raw,
        "input": usage.input_tokens,
        "output": usage.output_tokens,
        "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
    }


async def evaluate_fixture_async(fixture, model=MODEL_OPUS, n_samples=1):
    from extract import (
        detect_canonical_table_rects, identify_page_1_tables,
        identify_page_2_tables, load_law_cards,
    )
    from warp import warp_image

    fix_dir = REPO / "scripts" / "eval" / "fixtures" / fixture
    with open(fix_dir / "ground-truth.json") as f:
        gt = json.load(f)
    truth = {row["name"]: (row["poolQty"], row["deckQty"]) for row in gt["rows"]}
    cards_by_t = load_law_cards()

    table_jobs = []
    for page_num in (1, 2):
        photo = fix_dir / f"photo{page_num}.jpg"
        warp_path = Path(f"/tmp/omr-warped/{fixture}-photo{page_num}.png")
        if not warp_path.exists():
            warp_image(photo, warp_path)
        warped = cv2.imread(str(warp_path))
        if warped is None:
            continue
        rects = detect_canonical_table_rects(warped)
        ident = identify_page_1_tables(rects) if page_num == 1 else identify_page_2_tables(rects)
        for tn, tb in ident.items():
            cards = cards_by_t.get(tn, [])
            if cards:
                x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
                # Pad table crop slightly for context.
                x0, y0 = max(0, x - 5), max(0, y - 5)
                x1, y1 = min(warped.shape[1], x + w + 5), min(warped.shape[0], y + h + 5)
                tcrop = warped[y0:y1, x0:x1]
                table_jobs.append((tn, cards, tcrop))

    client = anthropic.AsyncAnthropic()
    sem = asyncio.Semaphore(8)

    async def worker(tn, cards, crop, sample_idx):
        async with sem:
            img_b64 = encode_table_image(crop, n_rows=len(cards), max_dim=1568, min_row_h=35)
            return sample_idx, await classify_one_table(client, tn, cards, img_b64, model)

    print(f"  {fixture}: {len(table_jobs)} tables x {n_samples} samples", file=sys.stderr)
    t0 = time.time()
    tasks = []
    for tn, cards, crop in table_jobs:
        for s in range(n_samples):
            tasks.append(worker(tn, cards, crop, s))
    raw_results = await asyncio.gather(*tasks)
    elapsed = time.time() - t0

    # Group results by table (collect all samples)
    grouped = {}  # table_name -> list of parsed dicts
    in_tok = out_tok = cache_tok = 0
    for sample_idx, r in raw_results:
        in_tok += r["input"]
        out_tok += r["output"]
        cache_tok += r["cache_read"]
        grouped.setdefault(r["table"], []).append(r["parsed"])

    # For each table, vote per cell
    correct_pool = correct_deck = total = 0
    per_cell = []
    for tn, cards, _ in table_jobs:
        samples = grouped.get(tn, [{}])
        for c in cards:
            n = int(c["number"])
            pool_votes = [s.get(n, (0, 0))[0] for s in samples]
            deck_votes = [s.get(n, (0, 0))[1] for s in samples]
            if pool_votes:
                pool_pred = Counter(pool_votes).most_common(1)[0][0]
            else:
                pool_pred = 0
            if deck_votes:
                deck_pred = Counter(deck_votes).most_common(1)[0][0]
            else:
                deck_pred = 0
            t_pool, t_deck = truth.get(c["name"], (0, 0))
            correct_pool += int(pool_pred == t_pool)
            correct_deck += int(deck_pred == t_deck)
            total += 1
            per_cell.append({
                "card": c["name"], "table": tn, "n": n,
                "pool_pred": pool_pred, "pool_truth": t_pool,
                "deck_pred": deck_pred, "deck_truth": t_deck,
            })

    p = PRICING[model]
    cost = (in_tok * p["input"] + out_tok * p["output"] + cache_tok * p["cache_read"]) / 1_000_000
    return {
        "fixture": fixture, "model": model, "n_samples": n_samples,
        "n_tables": len(table_jobs), "n_calls": len(table_jobs) * n_samples,
        "n_cells_evaluated": total,
        "pool_acc": correct_pool / max(1, total),
        "deck_acc": correct_deck / max(1, total),
        "combined_acc": (correct_pool + correct_deck) / max(1, total * 2),
        "input_tokens": in_tok, "output_tokens": out_tok, "cache_read_tokens": cache_tok,
        "cost_usd": cost,
        "elapsed_s": elapsed,
        "per_cell_predictions": per_cell,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: claude_template.py <fixture|all> [--model] [--samples N] [--out PATH]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    model = MODEL_OPUS
    n_samples = 1
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    if "--samples" in sys.argv:
        n_samples = int(sys.argv[sys.argv.index("--samples") + 1])
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = asyncio.run(evaluate_fixture_async(f, model=model, n_samples=n_samples))
        all_r.append(r)
        print(
            f"{f:<20} pool_acc={100*r['pool_acc']:.1f}% deck_acc={100*r['deck_acc']:.1f}% "
            f"combined={100*r['combined_acc']:.1f}% cost=${r['cost_usd']:.3f} t={r['elapsed_s']:.0f}s",
            file=sys.stderr,
        )
    if "--out" in sys.argv:
        with open(sys.argv[sys.argv.index("--out") + 1], "w") as f:
            json.dump(all_r, f, indent=2)
    total_correct = sum(int(r["combined_acc"] * r["n_cells_evaluated"] * 2) for r in all_r)
    total_n = sum(r["n_cells_evaluated"] * 2 for r in all_r)
    total_cost = sum(r["cost_usd"] for r in all_r)
    print(f"\nOverall: {100 * total_correct / max(1, total_n):.1f}% accuracy, ${total_cost:.3f} total", file=sys.stderr)


if __name__ == "__main__":
    main()
