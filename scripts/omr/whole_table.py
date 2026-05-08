#!/usr/bin/env python3
"""
Whole-table Claude classifier.

Send a cropped table image (one table = one API call) and ask Claude
to output PLAYED + TOTAL counts for every card row, identified by the
printed card number.

This bypasses pixel-precise ROI detection entirely — Claude reads off
the printed table structure visually. Cost: ~10 calls per fixture (one
per detected table) instead of ~250 cells.
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
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent.parent
try:
    from dotenv import load_dotenv
    load_dotenv(REPO / ".env")
    load_dotenv(REPO / ".env.local", override=True)
except ImportError:
    pass

import anthropic  # noqa: E402

MODEL_HAIKU = "claude-haiku-4-5-20251001"
MODEL_SONNET = "claude-sonnet-4-5"
MODEL_OPUS = "claude-opus-4-7"

PRICING = {
    MODEL_HAIKU: {"input": 1.0, "output": 5.0, "cache_read": 0.10},
    MODEL_SONNET: {"input": 3.0, "output": 15.0, "cache_read": 0.30},
    MODEL_OPUS: {"input": 15.0, "output": 75.0, "cache_read": 1.50},
}


@dataclass
class TableCallResult:
    table: str
    cards_in_table: list[dict]
    parsed: dict[int, tuple[int, int]]  # card_number -> (pool, deck)
    raw_response: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    elapsed_s: float
    error: str | None = None


def encode_table_image(crop: np.ndarray, n_rows: int | None = None, max_dim: int = 2400, min_row_h: int = 40) -> str:
    """Encode a table crop with both UPSCALE-for-small-tables and
    DOWNSCALE-to-max-dim handling.

    If n_rows is given and the table's per-row height is below min_row_h,
    scale up. Otherwise just downscale to max_dim if too big.
    """
    h, w = crop.shape[:2]
    target_h = h
    target_w = w
    # Upscale if rows too small
    if n_rows and h / max(1, n_rows) < min_row_h:
        scale_up = (min_row_h * n_rows) / max(1, h)
        # Cap at max_dim on the long side
        new_h = h * scale_up
        new_w = w * scale_up
        if max(new_h, new_w) > max_dim:
            scale_up = max_dim / max(new_h, new_w) * scale_up
        target_h = int(h * scale_up)
        target_w = int(w * scale_up)
    elif max(h, w) > max_dim:
        s = max_dim / max(h, w)
        target_h, target_w = int(h * s), int(w * s)
    if (target_h, target_w) != (h, w):
        crop = cv2.resize(crop, (target_w, target_h), interpolation=cv2.INTER_CUBIC if target_h > h else cv2.INTER_AREA)
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode("utf-8")


SYSTEM_PROMPT_TABLE = """You read tally counts from a Star Wars: Unlimited sealed deck registration sheet table.

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

# OUTPUT

You will be given the list of card numbers expected in this table. Output ONE JSON object with the exact form:
{"rows": [{"n": <card_number>, "p": <played_qty_LEFTMOST_column>, "t": <total_qty_SECOND_column>}, ...]}

Include EVERY expected card number in the output, even ones with 0/0. Use lowercase keys exactly. No other text outside the JSON."""


async def classify_table_async(
    client: anthropic.AsyncAnthropic,
    table_name: str,
    cards: list[dict],
    image_b64: str,
    model: str = MODEL_SONNET,
) -> TableCallResult:
    sorted_cards = sorted(cards, key=lambda c: int(c["number"]))
    name_list_lines = [
        f"  #{c['number']:>3} {c['name']}{' — ' + c['subtitle'] if c.get('subtitle') else ''}"
        for c in sorted_cards
    ]
    user_text = (
        f"Table: {table_name}\n"
        f"Expected cards in this table (use these as the closed vocabulary; verify each printed row matches one of these by NAME and NUMBER):\n"
        + "\n".join(name_list_lines)
        + "\n\nOutput JSON for ALL of these card numbers in numerical order."
    )
    t0 = time.time()
    last_exc = None
    response = None
    for attempt in range(4):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=4000,
                system=[{"type": "text", "text": SYSTEM_PROMPT_TABLE, "cache_control": {"type": "ephemeral"}}],
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                            {"type": "text", "text": user_text},
                        ],
                    }
                ],
            )
            break
        except (anthropic.InternalServerError, anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            last_exc = e
            await asyncio.sleep(2 ** attempt)
        except Exception as e:
            return TableCallResult(
                table=table_name, cards_in_table=cards, parsed={}, raw_response="",
                input_tokens=0, output_tokens=0, cache_read_tokens=0,
                elapsed_s=time.time() - t0, error=f"{type(e).__name__}: {str(e)[:200]}",
            )
    if response is None:
        return TableCallResult(
            table=table_name, cards_in_table=cards, parsed={}, raw_response="",
            input_tokens=0, output_tokens=0, cache_read_tokens=0,
            elapsed_s=time.time() - t0, error=f"retry exhausted: {type(last_exc).__name__ if last_exc else 'unknown'}",
        )
    elapsed = time.time() - t0
    raw = response.content[0].text if response.content else ""
    parsed: dict[int, tuple[int, int]] = {}
    # Find JSON in response
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            payload = json.loads(m.group(0))
            for row in payload.get("rows", []):
                n = int(row["n"])
                p = int(row.get("p", 0))
                t = int(row.get("t", 0))
                parsed[n] = (t, p)  # (pool, deck) — note order
        except (json.JSONDecodeError, KeyError, ValueError):
            pass
    usage = response.usage
    return TableCallResult(
        table=table_name,
        cards_in_table=cards,
        parsed=parsed,
        raw_response=raw,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        elapsed_s=elapsed,
    )


async def classify_all_tables(
    table_jobs: list[tuple[str, list[dict], np.ndarray]],
    model: str = MODEL_SONNET,
    concurrency: int = 8,
) -> list[TableCallResult]:
    client = anthropic.AsyncAnthropic()
    sem = asyncio.Semaphore(concurrency)

    async def worker(t_name, cards, crop):
        async with sem:
            img_b64 = encode_table_image(crop, n_rows=len(cards))
            return await classify_table_async(client, t_name, cards, img_b64, model=model)

    results = await asyncio.gather(*[worker(t, c, crop) for t, c, crop in table_jobs])
    return list(results)


def evaluate_fixture(fixture: str, model: str = MODEL_SONNET, save_crops: bool = False) -> dict:
    """Run whole-table Claude on one fixture. Returns metrics."""
    sys.path.insert(0, str(REPO / "scripts" / "omr"))
    from extract import (
        detect_canonical_table_rects,
        identify_page_1_tables,
        identify_page_2_tables,
        load_law_cards,
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
        if page_num == 1:
            ident = identify_page_1_tables(rects)
        else:
            ident = identify_page_2_tables(rects)
        for tn, tb in ident.items():
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            crop = warped[y:y + h, x:x + w]
            if save_crops:
                cv2.imwrite(f"/tmp/omr-debug/{fixture}-{tn}-table.png", crop)
            cards = cards_by_t.get(tn, [])
            if cards:
                table_jobs.append((tn, cards, crop))

    print(f"  {fixture}: {len(table_jobs)} table calls", file=sys.stderr)
    results = asyncio.run(classify_all_tables(table_jobs, model=model))

    # Score
    correct_pool = correct_deck = total = 0
    pool_sum = deck_sum = 0
    in_tok = out_tok = 0
    cache_tok = 0
    elapsed = 0.0
    errors = []
    per_cell_predictions: list[dict] = []
    for r in results:
        elapsed = max(elapsed, r.elapsed_s)
        in_tok += r.input_tokens
        out_tok += r.output_tokens
        cache_tok += r.cache_read_tokens
        if r.error:
            errors.append(f"{r.table}: {r.error}")
        for card in r.cards_in_table:
            n = int(card["number"])
            pool_pred, deck_pred = r.parsed.get(n, (0, 0))
            t_pool, t_deck = truth.get(card["name"], (0, 0))
            correct_pool += int(pool_pred == t_pool)
            correct_deck += int(deck_pred == t_deck)
            total += 1
            pool_sum += pool_pred
            deck_sum += deck_pred
            per_cell_predictions.append({
                "card": card["name"], "table": r.table, "n": n,
                "pool_pred": pool_pred, "pool_truth": t_pool,
                "deck_pred": deck_pred, "deck_truth": t_deck,
            })

    p = PRICING[model]
    cost = (in_tok * p["input"] + out_tok * p["output"] + cache_tok * p["cache_read"]) / 1_000_000.0
    return {
        "fixture": fixture,
        "model": model,
        "n_calls": len(results),
        "n_cells_evaluated": total,
        "pool_acc": correct_pool / max(1, total),
        "deck_acc": correct_deck / max(1, total),
        "combined_acc": (correct_pool + correct_deck) / max(1, total * 2),
        "pool_sum": pool_sum,
        "deck_sum": deck_sum,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "cache_read_tokens": cache_tok,
        "cost_usd": cost,
        "elapsed_s_max": elapsed,
        "errors": errors,
        "per_cell_predictions": per_cell_predictions,
    }


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: whole_table.py <fixture|all> [--model haiku|sonnet|opus] [--save-crops] [--out PATH]", file=sys.stderr)
        sys.exit(1)
    fixture_arg = sys.argv[1]
    model = MODEL_SONNET
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    save_crops = "--save-crops" in sys.argv

    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fixture_arg == "all" else [fixture_arg]
    all_results = []
    for f in fixtures:
        r = evaluate_fixture(f, model=model, save_crops=save_crops)
        all_results.append(r)
        print(
            f"{f:<20} pool_acc={100*r['pool_acc']:.1f}% deck_acc={100*r['deck_acc']:.1f}% "
            f"combined={100*r['combined_acc']:.1f}% pool_sum={r['pool_sum']}/96 "
            f"deck_sum={r['deck_sum']}/30-35 cost=${r['cost_usd']:.3f} t={r['elapsed_s_max']:.1f}s",
            file=sys.stderr,
        )

    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
        with open(out_path, "w") as f:
            json.dump(all_results, f, indent=2)
        print(f"saved to {out_path}", file=sys.stderr)

    # Aggregate
    total_correct = sum(int(r["combined_acc"] * r["n_cells_evaluated"] * 2) for r in all_results)
    total_n = sum(r["n_cells_evaluated"] * 2 for r in all_results)
    total_cost = sum(r["cost_usd"] for r in all_results)
    print(f"\nOverall: {100 * total_correct / max(1, total_n):.1f}% accuracy, ${total_cost:.3f} total", file=sys.stderr)


if __name__ == "__main__":
    main()
