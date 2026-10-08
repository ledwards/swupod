#!/usr/bin/env python3
"""
Per-cell Claude tiebreaker — focused crop classification.

Used to test: given Opus whole-table output, can per-cell Claude
correct the failures?

Two modes:
  1. ORACLE: send Claude only the cells where Opus is wrong (cheating —
     gives upper bound on what per-cell can do)
  2. INVARIANT: send Claude all cells in tables that fail invariants
     (production-realistic)

Per-cell crop is a tightly cropped row (PLAYED + TOTAL columns) at
high zoom. Claude gets a focused look + a strong prompt.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
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
from whole_table import MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, PRICING  # noqa: E402


SYSTEM_PROMPT_PERCELL = """You are reading a single ROW from a tally registration sheet.

The image shows ONE row containing ONLY the PLAYED and TOTAL columns of that row, side by side.

Layout: image left half = PLAYED column, image right half = TOTAL column.

Reading rules:
- An empty cell = 0
- "|" or "✓" or digit "1" = 1
- "||" or "2" = 2; "|||" or "3" = 3; etc.
- Crossed out / smudged: report your best read of the visible value.

Reply with JSON: {"p": <played>, "t": <total>}. Just the JSON, no other text."""


async def classify_percell(client, p_crop, t_crop, model: str):
    """Classify one cell's PLAYED + TOTAL via combined side-by-side crop."""
    # Combine PLAYED + TOTAL crops side-by-side with a small gap.
    if p_crop.size == 0 or t_crop.size == 0:
        return 0, 0, {"input": 0, "output": 0, "cache_read": 0}
    h = max(p_crop.shape[0], t_crop.shape[0])
    # Pad to same height
    def pad_to(arr, target_h):
        ph = target_h - arr.shape[0]
        if ph <= 0: return arr
        return cv2.copyMakeBorder(arr, ph // 2, ph - ph // 2, 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    p_crop = pad_to(p_crop, h)
    t_crop = pad_to(t_crop, h)
    gap = np.full((h, 8, 3), 200, dtype=np.uint8)
    combined = np.hstack([p_crop, gap, t_crop])
    # Upscale for Claude.
    scale = max(2.0, 200 / max(1, h))
    if scale > 1:
        new_w = min(2000, int(combined.shape[1] * scale))
        new_h = min(800, int(combined.shape[0] * scale))
        combined = cv2.resize(combined, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    rgb = cv2.cvtColor(combined, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    img_b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    kwargs = dict(
        model=model, max_tokens=100,
        system=[{"type": "text", "text": SYSTEM_PROMPT_PERCELL, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                {"type": "text", "text": "How many marks in each cell?"},
            ],
        }],
    )
    last_e = None
    for attempt in range(4):
        try:
            response = await client.messages.create(**kwargs)
            break
        except (anthropic.InternalServerError, anthropic.RateLimitError) as e:
            last_e = e
            await asyncio.sleep(2 ** attempt)
    else:
        return 0, 0, {"input": 0, "output": 0, "cache_read": 0}
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
        "input": usage.input_tokens,
        "output": usage.output_tokens,
        "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
    }


def get_percell_rois(fixture: str) -> dict:
    """Get per-cell PLAYED+TOTAL ROIs and warped image for each table+card."""
    from extract import (
        detect_canonical_table_rects, identify_page_1_tables,
        identify_page_2_tables, load_law_cards,
    )
    from grid import extract_grid, derive_row_positions
    from warp import warp_image

    fix_dir = REPO / "scripts" / "eval" / "fixtures" / fixture
    cards_by_t = load_law_cards()

    rois = {}  # (table_name, card_number) -> {warped, played_roi, total_roi}
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
            n = len(cards)
            if n == 0: continue
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            tcrop = warped[y:y + h, x:x + w]
            grid_data = extract_grid(tcrop)
            row_positions = derive_row_positions(grid_data.h_lines, n)
            if row_positions is None:
                # Uniform fallback
                header_h = 75 if page_num == 1 else 65
                row_h = (h - header_h) / n
                row_positions = [(int(header_h + i * row_h), int(header_h + (i + 1) * row_h)) for i in range(n)]
            sorted_cards = sorted(cards, key=lambda c: int(c["number"]))
            for i, c in enumerate(sorted_cards):
                row_top, row_bot = row_positions[i]
                # PLAYED = first ~14% of width, TOTAL = next ~14%
                played_x0 = int(w * 0.04)
                played_x1 = int(w * 0.14)
                total_x0 = int(w * 0.16)
                total_x1 = int(w * 0.27)
                p_roi = tcrop[max(0, row_top - 2):min(h, row_bot + 2), played_x0:played_x1]
                t_roi = tcrop[max(0, row_top - 2):min(h, row_bot + 2), total_x0:total_x1]
                rois[(tn, int(c["number"]))] = {
                    "card": c, "table": tn, "page": page_num,
                    "played_roi": p_roi, "total_roi": t_roi,
                }
    return rois


async def run_percell_async(targets, model=MODEL_OPUS, concurrency=8):
    """Run per-cell classification on a list of (table, card_n, p_roi, t_roi)."""
    client = anthropic.AsyncAnthropic()
    sem = asyncio.Semaphore(concurrency)

    async def worker(tn, n, p_roi, t_roi):
        async with sem:
            p, t, tok = await classify_percell(client, p_roi, t_roi, model=model)
            return tn, n, p, t, tok

    return await asyncio.gather(*[worker(tn, n, p_roi, t_roi) for tn, n, p_roi, t_roi in targets])


def evaluate_combination(opus_results_path: str, model_for_tiebreak: str = MODEL_OPUS, mode: str = "all_zero", out_path: str = None):
    """Run combination: Opus whole-table + per-cell tiebreak.

    Modes:
      all_zero: tiebreak any cell where opus says 0/0
      invariant_failed: tiebreak cells in tables whose pool sum violates invariants
      oracle: tiebreak cells where opus is wrong (UPPER BOUND only)
    """
    with open(opus_results_path) as f:
        opus_results = json.load(f)

    final = []
    total_cost = 0.0
    p = PRICING[model_for_tiebreak]

    for fix_data in opus_results:
        fixture = fix_data["fixture"]
        rois = get_percell_rois(fixture)
        # Identify tiebreak targets per mode
        targets = []
        opus_predictions = {}
        for cell in fix_data["per_cell_predictions"]:
            k = (cell["table"], cell["n"])
            opus_predictions[k] = (cell["pool_pred"], cell["deck_pred"])
        if mode == "all_zero":
            for k, (p_pool, p_deck) in opus_predictions.items():
                if p_pool == 0 and p_deck == 0 and k in rois:
                    r = rois[k]
                    targets.append((k[0], k[1], r["played_roi"], r["total_roi"]))
        elif mode == "oracle":
            # Use truth: only tiebreak where opus is wrong
            for cell in fix_data["per_cell_predictions"]:
                k = (cell["table"], cell["n"])
                if (cell["pool_pred"] != cell["pool_truth"] or cell["deck_pred"] != cell["deck_truth"]) and k in rois:
                    r = rois[k]
                    targets.append((k[0], k[1], r["played_roi"], r["total_roi"]))
        elif mode == "invariant_failed":
            # Per-table: if table's pool_sum doesn't match invariant, tiebreak that table
            from collections import defaultdict
            by_table = defaultdict(list)
            for cell in fix_data["per_cell_predictions"]:
                by_table[cell["table"]].append(cell)
            failed_tables = set()
            for t, cells in by_table.items():
                pool_sum = sum(c["pool_pred"] for c in cells)
                # Invariants:
                if t == "Leaders" and pool_sum != 6: failed_tables.add(t)
                elif t == "Bases" and pool_sum < 6: failed_tables.add(t)
            # Also: total pool sum should be 96
            total_pool = sum(c["pool_pred"] for c in fix_data["per_cell_predictions"])
            if total_pool != 96:
                # Add tables where pool count seems off (heuristic: pool ratio looks low)
                for t in by_table:
                    failed_tables.add(t)  # all tables when total off
            for k, (p_pool, p_deck) in opus_predictions.items():
                if k[0] in failed_tables and k in rois:
                    r = rois[k]
                    targets.append((k[0], k[1], r["played_roi"], r["total_roi"]))

        print(f"  {fixture} mode={mode}: {len(targets)} per-cell tiebreak targets", file=sys.stderr)

        # Run per-cell
        t0 = time.time()
        if targets:
            tiebreak_results = asyncio.run(run_percell_async(targets, model=model_for_tiebreak))
        else:
            tiebreak_results = []
        elapsed = time.time() - t0

        # Apply tiebreak
        tiebreak_in = tiebreak_out = tiebreak_cache = 0
        for tn, n, new_p, new_t, tok in tiebreak_results:
            tiebreak_in += tok["input"]
            tiebreak_out += tok["output"]
            tiebreak_cache += tok["cache_read"]
            # The tiebreak's "p" is PLAYED (deck), "t" is TOTAL (pool)
            opus_predictions[(tn, n)] = (new_t, new_p)  # (pool, deck)

        # Score
        correct_pool = correct_deck = total = 0
        per_cell_final = []
        for cell in fix_data["per_cell_predictions"]:
            k = (cell["table"], cell["n"])
            pool_pred, deck_pred = opus_predictions[k]
            t_pool, t_deck = cell["pool_truth"], cell["deck_truth"]
            correct_pool += int(pool_pred == t_pool)
            correct_deck += int(deck_pred == t_deck)
            total += 1
            per_cell_final.append({
                "card": cell["card"], "table": cell["table"], "n": cell["n"],
                "pool_pred": pool_pred, "pool_truth": t_pool,
                "deck_pred": deck_pred, "deck_truth": t_deck,
            })

        tiebreak_cost = (tiebreak_in * p["input"] + tiebreak_out * p["output"] + tiebreak_cache * p["cache_read"]) / 1_000_000
        total_cost += tiebreak_cost
        final.append({
            "fixture": fixture, "mode": mode, "tiebreak_model": model_for_tiebreak,
            "n_targets": len(targets),
            "n_cells_evaluated": total,
            "pool_acc": correct_pool / max(1, total),
            "deck_acc": correct_deck / max(1, total),
            "combined_acc": (correct_pool + correct_deck) / max(1, total * 2),
            "tiebreak_cost": tiebreak_cost,
            "tiebreak_elapsed": elapsed,
            "per_cell_predictions": per_cell_final,
        })
        print(
            f"    pool_acc={100*correct_pool/total:.1f}% deck_acc={100*correct_deck/total:.1f}% "
            f"combined={100*(correct_pool+correct_deck)/(total*2):.1f}% "
            f"tiebreak_cost=${tiebreak_cost:.3f}",
            file=sys.stderr,
        )

    if out_path:
        with open(out_path, "w") as f:
            json.dump(final, f, indent=2)
    total_correct = sum(int(r["combined_acc"] * r["n_cells_evaluated"] * 2) for r in final)
    total_n = sum(r["n_cells_evaluated"] * 2 for r in final)
    print(f"\nOverall: {100 * total_correct / max(1, total_n):.1f}% accuracy, ${total_cost:.3f} additional cost (+ Opus pass cost)", file=sys.stderr)
    return final


def main():
    if len(sys.argv) < 3:
        print("Usage: percell_check.py <opus_results.json> <mode> [--model] [--out]", file=sys.stderr)
        print("  mode: all_zero | oracle | invariant_failed", file=sys.stderr)
        sys.exit(1)
    opus_path = sys.argv[1]
    mode = sys.argv[2]
    model = MODEL_OPUS
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    evaluate_combination(opus_path, model_for_tiebreak=model, mode=mode, out_path=out)


if __name__ == "__main__":
    main()
