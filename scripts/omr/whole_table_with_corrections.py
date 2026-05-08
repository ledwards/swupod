#!/usr/bin/env python3
"""
Whole-table Opus with INTEGRATED correction detection.

Per cell, return:
  - p, t: counts (best read)
  - p_unclear, t_unclear: bool — true if the cell is ambiguous
    (visible correction, eraser smudge, judge signature)

In production: cells flagged as unclear are surfaced in the issues UI
for human review. Per the user's success criteria, correctly flagging
a corrected cell as "unclear" counts as a SUCCESS — even if the
predicted count happens to differ from the post-correction truth.

Eval rule (with this success criterion):
  cell is correct IFF (pool_pred == pool_truth AND deck_pred == deck_truth)
                      OR (pool_unclear OR deck_unclear)
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import re
import sys
import time
from dataclasses import dataclass
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


SYSTEM_PROMPT_TABLE_WITH_UNCLEAR = """You read tally counts from a Star Wars: Unlimited sealed deck registration sheet table.

The image is a cropped portion of one table.

# COLUMN LAYOUT (CRITICAL — read carefully)

Each row has 4 columns. Read STRICTLY left to right:
  Column 1 (LEFTMOST): PLAYED — copies in the deck (0 or 1 typical, up to 4)
  Column 2: TOTAL — copies the player owns (0-3 typical)
  Column 3: NO. # — printed card number (DO NOT confuse digit content here with player marks)
  Column 4 (RIGHTMOST): card name + subtitle

The TOP of the table has a HEADER ROW with the literal text "PLAYED  TOTAL  NO. #" — verify your column ordering against this header before counting any data row.

# READING MARKS

- Empty cell = 0
- Single tally mark "|" or check "✓" or digit "1" written by hand = 1
- "||" or "2" = 2; "|||" or "3" = 3; etc.
- The PRINTED card number (column 3) is NOT a mark. Ignore it for counting purposes — it just identifies the row.
- Smudges or eraser marks: report your best read of the visible value.
- If a number is corrected (one crossed out, another written), report the visible CURRENT value.

# COMMON MISTAKES TO AVOID

1. DO NOT swap PLAYED and TOTAL. PLAYED is leftmost. TOTAL is second from left.
2. DO NOT count the printed card number as a mark in TOTAL.
3. Process every row even if many are 0/0 (most rows ARE 0/0).

# HARD INVARIANT (CRITICAL)

For ANY row: PLAYED ≤ TOTAL. The deck (PLAYED) is a subset of the player's pool (TOTAL). If you read PLAYED=1 and TOTAL=0 you have SWAPPED them — re-check carefully which column is leftmost. The leftmost column with marks is PLAYED.

# UNCLEAR FLAG (additional output for human review)

Additionally flag cells for human review by setting `p_unclear` or `t_unclear` to `true` when ONE of:
  - Cell has a CROSSED-OUT mark (clear scribble cancelling a previous value)
  - Cell has a judge SIGNATURE / INITIAL touching or near it
  - Cell shows TWO overwritten values
  - Cell has visible eraser smudges indicating a correction

Otherwise keep both flags `false`. Always report your best-read count regardless of the flag.

# OUTPUT

Output ONE JSON object with the exact form:
{"rows": [{"n": <card_number>, "p": <played_qty_LEFTMOST_column>, "t": <total_qty_SECOND_column>, "p_unclear": <bool>, "t_unclear": <bool>}, ...]}

Include EVERY expected card number in the output, even ones with 0/0/false/false. Use lowercase keys exactly. No other text outside the JSON."""


@dataclass
class TableResult:
    table: str
    cards_in_table: list[dict]
    parsed: dict[int, dict]  # n -> {pool, deck, pool_unclear, deck_unclear}
    raw_response: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int


async def classify_table_with_unclear(
    client: anthropic.AsyncAnthropic, table_name: str, cards: list[dict],
    image_b64: str, model: str,
) -> TableResult:
    sorted_cards = sorted(cards, key=lambda c: int(c["number"]))
    name_list = "\n".join(
        f"  #{c['number']:>3} {c['name']}" + (f" — {c['subtitle']}" if c.get('subtitle') else "")
        for c in sorted_cards
    )
    user_text = (
        f"Table: {table_name}\n"
        f"Expected cards:\n{name_list}\n\n"
        f"Output JSON for ALL of these card numbers in numerical order, including unclear flags."
    )
    last_e = None
    response = None
    for attempt in range(4):
        try:
            response = await client.messages.create(
                model=model, max_tokens=6000,
                system=[{"type": "text", "text": SYSTEM_PROMPT_TABLE_WITH_UNCLEAR, "cache_control": {"type": "ephemeral"}}],
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                        {"type": "text", "text": user_text},
                    ],
                }],
            )
            break
        except (anthropic.InternalServerError, anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            last_e = e
            await asyncio.sleep(2 ** attempt)
    if response is None:
        return TableResult(table=table_name, cards_in_table=cards, parsed={}, raw_response="",
                           input_tokens=0, output_tokens=0, cache_read_tokens=0)
    raw = response.content[0].text if response.content else ""
    parsed: dict[int, dict] = {}
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            payload = json.loads(m.group(0))
            for row in payload.get("rows", []):
                n = int(row["n"])
                parsed[n] = {
                    "pool": int(row.get("t", 0)),
                    "deck": int(row.get("p", 0)),
                    "pool_unclear": bool(row.get("t_unclear", False)),
                    "deck_unclear": bool(row.get("p_unclear", False)),
                }
        except Exception as e:
            print(f"  parse failed for {table_name}: {e}", file=sys.stderr)
    usage = response.usage
    return TableResult(
        table=table_name, cards_in_table=cards, parsed=parsed, raw_response=raw,
        input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
    )


def evaluate_fixture(fixture: str, model=MODEL_OPUS) -> dict:
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
            if not cards: continue
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            tcrop = warped[y:y + h, x:x + w]
            table_jobs.append((tn, cards, tcrop))

    print(f"  {fixture}: {len(table_jobs)} table calls", file=sys.stderr)

    async def run_all():
        client = anthropic.AsyncAnthropic()
        sem = asyncio.Semaphore(8)
        async def worker(tn, cards, crop):
            async with sem:
                img_b64 = encode_table_image(crop, n_rows=len(cards))
                return await classify_table_with_unclear(client, tn, cards, img_b64, model)
        return await asyncio.gather(*[worker(tn, cards, crop) for tn, cards, crop in table_jobs])

    t0 = time.time()
    results = asyncio.run(run_all())
    elapsed = time.time() - t0

    in_tok = out_tok = cache_tok = 0
    # Two scoring modes:
    # MODE 1: strict (current) — cell correct iff pool_pred==pool_truth AND deck_pred==deck_truth
    # MODE 2: with-unclear-credit — cell correct iff strict-correct OR unclear-flagged
    strict_correct = unclear_correct = total = 0
    n_unclear_cells = 0
    n_unclear_correct_strict = 0  # how many unclear-flagged cells happened to also be strict-correct
    per_cell = []
    for r in results:
        in_tok += r.input_tokens
        out_tok += r.output_tokens
        cache_tok += r.cache_read_tokens
        for c in r.cards_in_table:
            n = int(c["number"])
            cell = r.parsed.get(n, {"pool": 0, "deck": 0, "pool_unclear": False, "deck_unclear": False})
            t_pool, t_deck = truth.get((c["name"], c.get("subtitle") or ""), (0, 0))
            strict_pool = cell["pool"] == t_pool
            strict_deck = cell["deck"] == t_deck

            unclear_flagged = cell["pool_unclear"] or cell["deck_unclear"]

            # Per-cell pool-and-deck combined success metric
            both_strict = strict_pool and strict_deck
            with_unclear_credit = both_strict or unclear_flagged

            total += 1
            if both_strict:
                strict_correct += 1
            if with_unclear_credit:
                unclear_correct += 1
            if unclear_flagged:
                n_unclear_cells += 1
                if both_strict:
                    n_unclear_correct_strict += 1

            per_cell.append({
                "card": c["name"], "table": r.table, "n": n,
                "pool_pred": cell["pool"], "pool_truth": t_pool,
                "deck_pred": cell["deck"], "deck_truth": t_deck,
                "pool_unclear": cell["pool_unclear"], "deck_unclear": cell["deck_unclear"],
                "strict_correct": both_strict,
                "with_unclear_correct": with_unclear_credit,
            })

    p = PRICING[model]
    cost = (in_tok * p["input"] + out_tok * p["output"] + cache_tok * p["cache_read"]) / 1_000_000
    return {
        "fixture": fixture, "model": model,
        "n_calls": len(results),
        "n_cells_evaluated": total,
        "strict_correct": strict_correct,
        "with_unclear_correct": unclear_correct,
        "n_unclear_flagged": n_unclear_cells,
        "n_unclear_also_strict_correct": n_unclear_correct_strict,
        "strict_acc": strict_correct / max(1, total),
        "with_unclear_acc": unclear_correct / max(1, total),
        "input_tokens": in_tok, "output_tokens": out_tok, "cache_read_tokens": cache_tok,
        "cost_usd": cost, "elapsed_s": elapsed,
        "per_cell_predictions": per_cell,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: whole_table_with_corrections.py <fixture|all> [--model] [--out]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    model = MODEL_OPUS
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = evaluate_fixture(f, model=model)
        all_r.append(r)
        print(
            f"{f:<20} strict={100*r['strict_acc']:.1f}% with_unclear={100*r['with_unclear_acc']:.1f}% "
            f"(unclear_flagged={r['n_unclear_flagged']}, of which {r['n_unclear_also_strict_correct']} also strict-correct) "
            f"cost=${r['cost_usd']:.3f}",
            file=sys.stderr,
        )
    if out:
        with open(out, "w") as f: json.dump(all_r, f, indent=2)
    total_strict = sum(r["strict_correct"] for r in all_r)
    total_uncl = sum(r["with_unclear_correct"] for r in all_r)
    total_n = sum(r["n_cells_evaluated"] for r in all_r)
    total_cost = sum(r["cost_usd"] for r in all_r)
    print(f"\nOverall STRICT (per-cell pair): {100*total_strict/total_n:.1f}% ({total_strict}/{total_n})", file=sys.stderr)
    print(f"Overall WITH UNCLEAR CREDIT: {100*total_uncl/total_n:.1f}% ({total_uncl}/{total_n})", file=sys.stderr)
    print(f"Total cost: ${total_cost:.3f}", file=sys.stderr)


if __name__ == "__main__":
    main()
