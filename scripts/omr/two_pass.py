#!/usr/bin/env python3
"""
Two-pass whole-table classifier.

Pass 1: Whole-table Opus call (cheap-ish).
Pass 2: For each row Pass 1 returned (n=0,p=0) AND truth-set has a mark
        we likely missed, send a HIGH-RESOLUTION row crop and ask Opus
        focused on just that row.

The trick: we don't actually KNOW the truth in production. So we need
a heuristic for "rows likely to be missed by pass 1". Patterns from
prior eval:
  - All rows whose neighbors had marks (sealed pools have clusters of
    owned cards)
  - All rows where pool=0 but prompt expected pool>0 from invariant
    sums (e.g., LEADER expects exactly 6 pool marks)

For now, the heuristic is: if the table's pool_sum doesn't match the
invariant target, do focused-row passes on rows with pool=0 starting
from densest-text rows (likely have a mark).

This script focuses pass 2 on EVERY row with pool_pred=0 (the strict
test) — gives an upper bound on what two-pass can achieve.
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
from whole_table import (  # noqa: E402
    MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, PRICING,
    SYSTEM_PROMPT_TABLE, encode_table_image,
    classify_table_async,
)


SYSTEM_PROMPT_ROW = """You are reading a single row from a deck registration table.

The image shows ONE row containing 4 columns left to right:
  PLAYED | TOTAL | NO. # | card name

Your task: count the marks in PLAYED and TOTAL columns.

- Empty cell = 0
- "|" or "✓" or digit "1" = 1
- "||" or "2" = 2; "|||" or "3" = 3; etc.
- The PRINTED card number in column 3 is NOT a mark.

Reply with just JSON: {"p": <played>, "t": <total>}. No other text."""


async def classify_row(client, row_crop: np.ndarray, model: str) -> tuple[int, int, dict]:
    """Classify a single row's PLAYED + TOTAL via focused crop."""
    if row_crop is None or row_crop.size == 0:
        return 0, 0, {"input": 0, "output": 0, "cache_read": 0}
    h, w = row_crop.shape[:2]
    if h <= 0 or w <= 0:
        return 0, 0, {"input": 0, "output": 0, "cache_read": 0}
    # Cap dimensions: max 4000 px on either side to stay safely under
    # Anthropic's 8000-px limit.
    if h < 80:
        scale = 80 / h
        new_h = int(h * scale)
        new_w = int(w * scale)
        if new_w > 4000:
            scale = 4000 / w
            new_w = 4000
            new_h = int(h * scale)
        row_crop = cv2.resize(row_crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    if max(row_crop.shape[:2]) > 4000:
        s = 4000 / max(row_crop.shape[:2])
        row_crop = cv2.resize(row_crop, (int(row_crop.shape[1] * s), int(row_crop.shape[0] * s)), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(row_crop, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    img_b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    kwargs = dict(
        model=model, max_tokens=200,
        system=[{"type": "text", "text": SYSTEM_PROMPT_ROW, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                {"type": "text", "text": "How many marks?"},
            ],
        }],
    )
    response = await client.messages.create(**kwargs)
    raw = response.content[0].text if response.content else ""
    m = re.search(r"\{[\s\S]*\}", raw)
    p = t = 0
    if m:
        try:
            payload = json.loads(m.group(0))
            p = int(payload.get("p", 0))
            t = int(payload.get("t", 0))
        except Exception:
            pass
    usage = response.usage
    return p, t, {
        "input": usage.input_tokens, "output": usage.output_tokens,
        "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
    }


def compute_row_crops_for_table(warped: np.ndarray, table_bounds: dict, num_cards: int) -> list[np.ndarray]:
    """Use grid extraction to get per-row crops within a table.

    Returns list of N crops (one per data row), each spanning full table
    width.
    """
    sys.path.insert(0, str(REPO / "scripts" / "omr"))
    from grid import extract_grid, derive_row_positions

    x, y, w, h = table_bounds["x"], table_bounds["y"], table_bounds["w"], table_bounds["h"]
    tcrop = warped[y:y + h, x:x + w]
    grid = extract_grid(tcrop)
    rows = derive_row_positions(grid.h_lines, num_cards)
    if rows is None:
        # Fallback: uniform spacing after a 75-px header.
        header_h = 75
        row_h = (h - header_h) / num_cards
        rows = [(int(header_h + i * row_h), int(header_h + (i + 1) * row_h)) for i in range(num_cards)]

    out = []
    for top_rel, bot_rel in rows:
        # Pad row by 4 px above/below.
        ry0 = max(0, top_rel - 4)
        ry1 = min(h, bot_rel + 4)
        row_crop = tcrop[ry0:ry1, :]
        out.append(row_crop)
    return out


async def two_pass_evaluate(fixture: str, model: str = MODEL_OPUS, focus_threshold_pred: int = 0) -> dict:
    """Run pass 1 (whole-table) + pass 2 (focused rows) on a fixture.

    focus_threshold_pred: if pass 1 returns pool_pred <= this AND
    truth has a mark, that row is reasked. In production we don't know
    truth, so pass 2 gets called on rows where pool_pred=0 (testing
    upper bound of how many false-negatives pass 2 can catch).
    """
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

    # Pass 1: whole-table
    table_data = []  # (table_name, cards, table_crop, warped, table_bounds)
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
                tcrop = warped[y:y + h, x:x + w]
                table_data.append((tn, cards, tcrop, warped, tb))

    pass1_in = pass1_out = pass1_cache = 0
    pass2_in = pass2_out = pass2_cache = 0

    print(f"  {fixture} pass 1 (whole-table)...", file=sys.stderr)
    client = anthropic.AsyncAnthropic()
    sem1 = asyncio.Semaphore(8)

    async def pass1_worker(tn, cards, crop):
        async with sem1:
            img_b64 = encode_table_image(crop, n_rows=len(cards))
            return await classify_table_async(client, tn, cards, img_b64, model=model)

    t0 = time.time()
    pass1_results = await asyncio.gather(
        *[pass1_worker(tn, cards, crop) for (tn, cards, crop, _, _) in table_data]
    )
    pass1_elapsed = time.time() - t0
    for r in pass1_results:
        pass1_in += r.input_tokens
        pass1_out += r.output_tokens
        pass1_cache += r.cache_read_tokens

    # Combine pass 1 results into per-card predictions
    # (table_name, card_number) -> (pool_pred, deck_pred)
    predictions = {}
    for (tn, cards, _, _, _), r in zip(table_data, pass1_results):
        for c in cards:
            n = int(c["number"])
            predictions[(tn, n)] = r.parsed.get(n, (0, 0))

    # Pass 2: focused row calls for cards where pass 1 predicted (0,0)
    focus_targets = []  # (table_name, card_number, card, row_crop)
    for tn, cards, _, warped_img, tb in table_data:
        row_crops = compute_row_crops_for_table(warped_img, tb, len(cards))
        for i, c in enumerate(sorted(cards, key=lambda c: int(c["number"]))):
            n = int(c["number"])
            pool_pred, deck_pred = predictions.get((tn, n), (0, 0))
            if pool_pred <= focus_threshold_pred and deck_pred <= focus_threshold_pred:
                focus_targets.append((tn, n, c, row_crops[i]))

    print(f"  {fixture} pass 2 (focused rows): {len(focus_targets)} targets", file=sys.stderr)

    sem2 = asyncio.Semaphore(16)

    async def pass2_worker(tn, n, c, row_crop):
        async with sem2:
            p, t, tok = await classify_row(client, row_crop, model=model)
            return tn, n, p, t, tok

    pass2_results = []
    pass2_elapsed = 0.0
    if focus_targets:
        t0 = time.time()
        pass2_results = await asyncio.gather(
            *[pass2_worker(tn, n, c, rc) for tn, n, c, rc in focus_targets]
        )
        pass2_elapsed = time.time() - t0
    if pass2_results:
        for tn, n, p, t, tok in pass2_results:
            # OVERRIDE pass 1 with pass 2 result if pass 2 found a mark
            old = predictions.get((tn, n), (0, 0))
            new_pool = max(old[0], t)
            new_deck = max(old[1], p)
            predictions[(tn, n)] = (new_pool, new_deck)
            pass2_in += tok["input"]
            pass2_out += tok["output"]
            pass2_cache += tok["cache_read"]
    else:
        pass2_elapsed = 0.0

    # Score
    correct_pool = correct_deck = total = 0
    per_cell = []
    for tn, cards, _, _, _ in table_data:
        for c in cards:
            n = int(c["number"])
            pool_pred, deck_pred = predictions.get((tn, n), (0, 0))
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
    pass1_cost = (pass1_in * p["input"] + pass1_out * p["output"] + pass1_cache * p["cache_read"]) / 1_000_000
    pass2_cost = (pass2_in * p["input"] + pass2_out * p["output"] + pass2_cache * p["cache_read"]) / 1_000_000
    return {
        "fixture": fixture, "model": model,
        "pass1_calls": len(table_data), "pass2_calls": len(focus_targets),
        "n_cells_evaluated": total,
        "pool_acc": correct_pool / max(1, total),
        "deck_acc": correct_deck / max(1, total),
        "combined_acc": (correct_pool + correct_deck) / max(1, total * 2),
        "pass1_cost": pass1_cost, "pass2_cost": pass2_cost,
        "total_cost": pass1_cost + pass2_cost,
        "pass1_elapsed": pass1_elapsed, "pass2_elapsed": pass2_elapsed,
        "per_cell_predictions": per_cell,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: two_pass.py <fixture|all> [--model] [--out PATH]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    model = MODEL_OPUS
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = asyncio.run(two_pass_evaluate(f, model=model))
        all_r.append(r)
        # Print progress so we know we made it
        sys.stdout.flush()
        print(
            f"{f:<20} pool_acc={100*r['pool_acc']:.1f}% deck_acc={100*r['deck_acc']:.1f}% "
            f"combined={100*r['combined_acc']:.1f}% "
            f"cost=${r['total_cost']:.3f} "
            f"(p1=${r['pass1_cost']:.3f} p2=${r['pass2_cost']:.3f}) "
            f"t=p1:{r['pass1_elapsed']:.0f}s+p2:{r['pass2_elapsed']:.0f}s",
            file=sys.stderr,
        )
    if "--out" in sys.argv:
        with open(sys.argv[sys.argv.index("--out") + 1], "w") as f:
            json.dump(all_r, f, indent=2)
    total_correct = sum(int(r["combined_acc"] * r["n_cells_evaluated"] * 2) for r in all_r)
    total_n = sum(r["n_cells_evaluated"] * 2 for r in all_r)
    total_cost = sum(r["total_cost"] for r in all_r)
    print(f"\nOverall: {100 * total_correct / max(1, total_n):.1f}% accuracy, ${total_cost:.3f} total", file=sys.stderr)


if __name__ == "__main__":
    main()
