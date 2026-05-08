#!/usr/bin/env python3
"""
Sweep dark-fraction thresholds across all 3 fixtures to find the best
binary (mark/no-mark) cutoff. If a single threshold works well on all
3, the pipeline is well-aligned. If they need very different thresholds,
ROI placement or threshold method is the issue.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))

import cv2  # noqa: E402
from extract import (  # noqa: E402
    cell_marks_signal,
    cell_roi,
    detect_canonical_table_rects,
    find_data_rows_top,
    column_xranges_for_table,
    identify_page_1_tables,
    identify_page_2_tables,
    load_law_cards,
    threshold_full_image,
)
from warp import warp_image  # noqa: E402

FIXTURES = ["sq-tom-law", "sq-lee-law", "casual-lee-law"]
PAGE_1 = {"Leaders", "Bases", "Vigilance", "Command"}


def collect_all_signals():
    """Run extraction across all fixtures, collecting (truth, dark_frac,
    n_components) tuples for both PLAYED (deck) and TOTAL (pool) cells."""
    cards_by_table = load_law_cards()
    all_played = []  # (truth_qty, dark_frac, n_components)
    all_total = []
    for fix in FIXTURES:
        fix_dir = REPO / "scripts" / "eval" / "fixtures" / fix
        with open(fix_dir / "ground-truth.json") as f:
            gt = json.load(f)
        truth = {row["name"]: (row["poolQty"], row["deckQty"]) for row in gt["rows"]}
        for page_num in (1, 2):
            warp_info = warp_image(fix_dir / f"photo{page_num}.jpg", Path(f"/tmp/omr-warped/{fix}-photo{page_num}.png"))
            warped = cv2.imread(f"/tmp/omr-warped/{fix}-photo{page_num}.png")
            page = warp_info["page"]
            rects = detect_canonical_table_rects(warped, min_short_frac=0.05)
            ident = identify_page_1_tables(rects) if page == 1 else identify_page_2_tables(rects)
            binary = threshold_full_image(warped)
            for tn, tb in ident.items():
                cards = cards_by_table.get(tn, [])
                if not cards:
                    continue
                data_top = find_data_rows_top(warped, tb, page)
                col_x = column_xranges_for_table(warped, tb, data_top)
                rows_total_h = (tb["y"] + tb["h"]) - data_top
                row_h = rows_total_h / len(cards)
                for i, card in enumerate(cards):
                    p_roi = cell_roi(tb, i, "PLAYED", data_top, row_h, col_x)
                    t_roi = cell_roi(tb, i, "TOTAL", data_top, row_h, col_x)
                    p_sig = cell_marks_signal(binary, p_roi)
                    t_sig = cell_marks_signal(binary, t_roi)
                    t_pool, t_deck = truth.get(card["name"], (0, 0))
                    all_played.append((t_deck, p_sig["dark_frac"], p_sig["n_components"], p_sig["total_area"]))
                    all_total.append((t_pool, t_sig["dark_frac"], t_sig["n_components"], t_sig["total_area"]))
    return all_played, all_total


def sweep_threshold(samples, label: str):
    """Sweep dark_frac threshold for binary (marked vs unmarked) classification."""
    print(f"\n=== {label} ===")
    print(f"Total samples: {len(samples)}")
    n_marked_truth = sum(1 for t, _, _, _ in samples if t > 0)
    print(f"Truly marked: {n_marked_truth} ({100*n_marked_truth/len(samples):.1f}%)")

    best = (0, 0, "")
    for thr in [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.07, 0.10]:
        tp = fp = tn = fn = 0
        for truth_qty, df, _, _ in samples:
            pred_marked = df > thr
            actual_marked = truth_qty > 0
            if pred_marked and actual_marked:
                tp += 1
            elif pred_marked and not actual_marked:
                fp += 1
            elif not pred_marked and not actual_marked:
                tn += 1
            else:
                fn += 1
        acc = (tp + tn) / len(samples)
        if acc > best[0]:
            best = (acc, thr, f"thr={thr:.3f} tp={tp} fp={fp} tn={tn} fn={fn}")
        print(f"  thr={thr:.3f}: acc={100*acc:.1f}% tp={tp} fp={fp} tn={tn} fn={fn}")
    print(f"  BEST: {best[2]}")


def main():
    played, total = collect_all_signals()
    sweep_threshold(played, "PLAYED column (deck)")
    sweep_threshold(total, "TOTAL column (pool)")


if __name__ == "__main__":
    main()
