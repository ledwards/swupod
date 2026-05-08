#!/usr/bin/env python3
"""
Multi-sample voting for whole-table classification.

Send each table N times with non-zero temperature, vote on per-cell
results. Higher cost but should reduce systematic errors.
"""
from __future__ import annotations

import asyncio
import json
import os
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
import re  # noqa: E402


async def _create_with_retry(client, kwargs, max_retries=8):
    last_exc = None
    for attempt in range(max_retries):
        try:
            return await client.messages.create(**kwargs)
        except (anthropic.InternalServerError, anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            last_exc = e
            # Exponential backoff up to 60s.
            await asyncio.sleep(min(60, 2 ** attempt + attempt))
    raise last_exc


async def one_sample(client, table_name, cards, image_b64, model, temperature):
    expected_numbers = sorted(int(c["number"]) for c in cards)
    user_text = (
        f"Table: {table_name}\n"
        f"Expected card numbers in this table: {expected_numbers}\n\n"
        f"Output JSON for ALL of these card numbers in order."
    )
    # Opus 4.7 doesn't support temperature; rely on inherent variance.
    kwargs = dict(
        model=model, max_tokens=4000,
        system=[{"type": "text", "text": SYSTEM_PROMPT_TABLE, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                {"type": "text", "text": user_text},
            ],
        }],
    )
    if not model.startswith("claude-opus-4-7"):
        kwargs["temperature"] = temperature
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
    return {
        "parsed": parsed,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_read_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
    }


async def classify_table_voted(client, table_name, cards, image_b64, model, n_samples, sem):
    async with sem:
        # Run samples SEQUENTIALLY so we don't hammer the API and get
        # 529 overloaded errors. With concurrent tables, this still
        # gives parallel work via the per-table gather.
        samples = []
        for i in range(n_samples):
            temp = 0.0 if i == 0 else 0.5
            try:
                samples.append(await one_sample(client, table_name, cards, image_b64, model, temp))
            except Exception as e:
                print(f"      {table_name} sample {i} failed: {type(e).__name__}", file=sys.stderr)
                samples.append({"parsed": {}, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0})
    # Vote per-cell
    voted = {}
    for c in cards:
        n = int(c["number"])
        pool_votes = []
        deck_votes = []
        for s in samples:
            if n in s["parsed"]:
                pool_votes.append(s["parsed"][n][0])
                deck_votes.append(s["parsed"][n][1])
        if pool_votes:
            pool_winner = Counter(pool_votes).most_common(1)[0][0]
        else:
            pool_winner = 0
        if deck_votes:
            deck_winner = Counter(deck_votes).most_common(1)[0][0]
        else:
            deck_winner = 0
        voted[n] = (pool_winner, deck_winner)
    total_tokens = {
        "input": sum(s["input_tokens"] for s in samples),
        "output": sum(s["output_tokens"] for s in samples),
        "cache_read": sum(s["cache_read_tokens"] for s in samples),
    }
    return voted, total_tokens


def evaluate(fixture, model=MODEL_OPUS, n_samples=3):
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
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            crop = warped[y:y + h, x:x + w]
            cards = cards_by_t.get(tn, [])
            if cards:
                table_jobs.append((tn, cards, crop))

    print(f"  {fixture}: {len(table_jobs)} tables × {n_samples} samples = {len(table_jobs) * n_samples} calls", file=sys.stderr)

    async def run_all():
        client = anthropic.AsyncAnthropic()
        sem = asyncio.Semaphore(8)
        tasks = []
        for tn, cards, crop in table_jobs:
            img_b64 = encode_table_image(crop, n_rows=len(cards))
            tasks.append(classify_table_voted(client, tn, cards, img_b64, model, n_samples, sem))
        return await asyncio.gather(*tasks)

    t0 = time.time()
    results = asyncio.run(run_all())
    elapsed = time.time() - t0

    correct_pool = correct_deck = total = 0
    in_tok = out_tok = cache_tok = 0
    per_cell = []
    for (tn, cards, _), (voted, tok) in zip(table_jobs, results):
        in_tok += tok["input"]
        out_tok += tok["output"]
        cache_tok += tok["cache_read"]
        for c in cards:
            n = int(c["number"])
            pool_pred, deck_pred = voted.get(n, (0, 0))
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
    cost = (in_tok * p["input"] + out_tok * p["output"] + cache_tok * p["cache_read"]) / 1_000_000.0
    return {
        "fixture": fixture, "model": model, "n_samples": n_samples,
        "n_calls": len(table_jobs) * n_samples,
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
        print("Usage: multisample.py <fixture|all> [--model] [--samples N] [--out PATH]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    model = MODEL_OPUS
    n_samples = 3
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    if "--samples" in sys.argv:
        n_samples = int(sys.argv[sys.argv.index("--samples") + 1])
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = evaluate(f, model=model, n_samples=n_samples)
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
