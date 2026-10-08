#!/usr/bin/env python3
"""
Opus ensemble: run TWO whole-table Opus calls with different prompts.

Use disagreement to flag uncertain cells. For agreement cases, accept
the prediction. For disagreement, do a focused per-cell check.

Strategy:
  - Prompt A: column-anchored ("PLAYED is leftmost")
  - Prompt B: density-anchored ("count visible ink in each cell")
  - When they agree: accept
  - When they disagree: take the safer (typically lower) value
  - Apply invariant fixup (deck <= pool)
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import cv2

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))
try:
    from dotenv import load_dotenv
    load_dotenv(REPO / ".env")
    load_dotenv(REPO / ".env.local", override=True)
except ImportError:
    pass

import anthropic  # noqa: E402
from whole_table import (  # noqa: E402
    MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, PRICING,
    SYSTEM_PROMPT_TABLE, encode_table_image,
)


SYSTEM_PROMPT_B = """You count tally marks in cells of a Star Wars: Unlimited deck registration sheet table.

You're given a cropped table image and a list of expected card numbers.

For EACH card row, count two values:
  - "p" (PLAYED): tally count in the LEFTMOST data column (deck count)
  - "t" (TOTAL): tally count in the SECOND data column (pool/owned count)

Tally markings:
  - Empty (no ink) = 0
  - One pencil/pen stroke ("|", check, or written digit "1") = 1
  - Two strokes ("||" or "2") = 2; three ("|||" or "3") = 3; etc.
  - Faint marks count as marks if visible at all
  - The PRINTED card number in column 3 is just the row label, NOT a mark

Hard constraint: PLAYED ≤ TOTAL for every row (the deck is a subset of the pool).

Output ONLY a JSON object: {"rows": [{"n": <number>, "p": <played>, "t": <total>}, ...]}
Include every expected card number with both values, even if both are 0."""


async def _create_with_retry(client, kwargs, max_retries=6):
    last_e = None
    for attempt in range(max_retries):
        try:
            return await client.messages.create(**kwargs)
        except (anthropic.InternalServerError, anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            last_e = e
            await asyncio.sleep(min(60, 2 ** attempt))
    raise last_e


async def call_with_prompt(client, table_name, cards, image_b64, model, system_prompt):
    sorted_cards = sorted(cards, key=lambda c: int(c["number"]))
    name_index = "\n".join(
        f"  #{c['number']:>3} {c['name']}" + (f" — {c['subtitle']}" if c.get('subtitle') else "")
        for c in sorted_cards
    )
    user_text = (
        f"Table: {table_name}\n"
        f"Expected cards in this table:\n{name_index}\n\n"
        f"Output JSON for ALL of these card numbers in numerical order."
    )
    kwargs = dict(
        model=model, max_tokens=4500,
        system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                {"type": "text", "text": user_text},
            ],
        }],
    )
    response = await _create_with_retry(client, kwargs)
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
    return parsed, {
        "input": usage.input_tokens, "output": usage.output_tokens,
        "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
    }


async def evaluate_async(fixture, model=MODEL_OPUS):
    from extract import (
        detect_canonical_table_rects, identify_page_1_tables,
        identify_page_2_tables, load_law_cards,
    )
    from warp import warp_image

    fix_dir = REPO / "scripts" / "eval" / "fixtures" / fixture
    with open(fix_dir / "ground-truth.json") as f:
        gt = json.load(f)
    truth = {(row["name"], row.get("subtitle") or ""): (row["poolQty"], row["deckQty"]) for row in gt["rows"]}
    cards_by_t = load_law_cards()

    table_jobs = []
    for page_num in (1, 2):
        photo = fix_dir / f"photo{page_num}.jpg"
        warp_path = Path(f"/tmp/omr-warped/{fixture}-photo{page_num}.png")
        if not warp_path.exists():
            warp_image(photo, warp_path)
        warped = cv2.imread(str(warp_path))
        if warped is None: continue
        rects = detect_canonical_table_rects(warped)
        ident = identify_page_1_tables(rects) if page_num == 1 else identify_page_2_tables(rects)
        for tn, tb in ident.items():
            cards = cards_by_t.get(tn, [])
            if cards:
                x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
                tcrop = warped[y:y + h, x:x + w]
                table_jobs.append((tn, cards, tcrop))

    client = anthropic.AsyncAnthropic()
    sem = asyncio.Semaphore(8)

    async def worker(tn, cards, crop):
        async with sem:
            img_b64 = encode_table_image(crop, n_rows=len(cards))
            # 2 parallel calls with different prompts
            res_a, tok_a = await call_with_prompt(client, tn, cards, img_b64, model, SYSTEM_PROMPT_TABLE)
            res_b, tok_b = await call_with_prompt(client, tn, cards, img_b64, model, SYSTEM_PROMPT_B)
            return tn, cards, res_a, res_b, tok_a, tok_b

    print(f"  {fixture}: {len(table_jobs)} tables × 2 prompts = {len(table_jobs)*2} calls", file=sys.stderr)
    t0 = time.time()
    results = await asyncio.gather(*[worker(tn, cards, crop) for tn, cards, crop in table_jobs])
    elapsed = time.time() - t0

    correct_pool = correct_deck = total = 0
    in_tok = out_tok = cache_tok = 0
    per_cell = []
    for tn, cards, res_a, res_b, tok_a, tok_b in results:
        in_tok += tok_a["input"] + tok_b["input"]
        out_tok += tok_a["output"] + tok_b["output"]
        cache_tok += tok_a["cache_read"] + tok_b["cache_read"]
        for c in cards:
            n = int(c["number"])
            pool_a, deck_a = res_a.get(n, (0, 0))
            pool_b, deck_b = res_b.get(n, (0, 0))
            # Combine: take MIN of two (conservative — agree-on-mark required)
            pool_pred = min(pool_a, pool_b)
            deck_pred = min(deck_a, deck_b)
            # Apply invariant (deck <= pool)
            deck_pred = min(deck_pred, pool_pred)
            t_pool, t_deck = truth.get((c["name"], c.get("subtitle") or ""), (0, 0))
            correct_pool += int(pool_pred == t_pool)
            correct_deck += int(deck_pred == t_deck)
            total += 1
            per_cell.append({
                "card": c["name"], "table": tn, "n": n,
                "pool_pred": pool_pred, "pool_truth": t_pool,
                "deck_pred": deck_pred, "deck_truth": t_deck,
                "pool_a": pool_a, "deck_a": deck_a,
                "pool_b": pool_b, "deck_b": deck_b,
            })

    p = PRICING[model]
    cost = (in_tok * p["input"] + out_tok * p["output"] + cache_tok * p["cache_read"]) / 1_000_000
    return {
        "fixture": fixture, "model": model,
        "n_calls": len(table_jobs) * 2,
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
        print("Usage: opus_ensemble.py <fixture|all> [--out PATH]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = asyncio.run(evaluate_async(f, model=MODEL_OPUS))
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
