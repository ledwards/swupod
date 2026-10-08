#!/usr/bin/env python3
"""
Option B: pure-CV pipeline with calibrated per-table templates.

Approach: detect table bounds, use a CALIBRATED template (per-table-type
header_h_px and row-h fractions) to compute precise cell ROIs, then use
a threshold-based classifier on tightly-cropped cell content.

Calibration: header_h_px values are measured empirically from canonical
reference warps and applied as table-relative pixel offsets. Tables are
small enough that within-photo variance after warping is < 5px.

This is the bound on "no-Claude pure CV" accuracy.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))


# Empirically-measured table layout per type (canonical pixel space).
# These values produce pixel-aligned ROIs within each detected table.
TABLE_TEMPLATES = {
    # Page 1 layouts (canonical 2200x1400):
    # Title bar (~32px) + column header (~30px) = ~62px of header.
    "Leaders":   {"header_px": 62, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Bases":     {"header_px": 50, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Vigilance": {"header_px": 70, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Command":   {"header_px": 70, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    # Page 2 layouts (canonical 1700x2200):
    "Aggression":{"header_px": 50, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Cunning":   {"header_px": 50, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Multicolor":{"header_px": 50, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Villainy":  {"header_px": 35, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "Heroism":   {"header_px": 35, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
    "NoAspect":  {"header_px": 35, "bottom_margin_px": 5, "played_x_frac": 0.04, "played_w_frac": 0.10, "total_x_frac": 0.16, "total_w_frac": 0.10},
}


def find_data_top_anchored(table_image: np.ndarray, header_px_estimate: int) -> int:
    """Find the y-position where data rows START.

    Use the header_px_estimate as a hint, then locate the FIRST horizontal
    divider line below it. Return the line's y-position.
    """
    h, w = table_image.shape[:2]
    gray = cv2.cvtColor(table_image, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 3)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    rd = h_lines.sum(axis=1) / 255.0 / h_lines.shape[1]
    # Search from header_px_estimate-15 to header_px_estimate+30 for the
    # first peak.
    search_lo = max(0, header_px_estimate - 15)
    search_hi = min(h, header_px_estimate + 30)
    best_y = header_px_estimate
    best_d = 0
    for y in range(search_lo, search_hi):
        if rd[y] > best_d:
            best_d = rd[y]
            best_y = y
    return best_y


def cell_classify(cell: np.ndarray, threshold: int = 100) -> tuple[int, float]:
    """Classify a tightly-cropped cell as 0/1/2/3+ marks."""
    if cell.size == 0:
        return 0, 0.5
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 3)
    _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)
    # Erode 1px to remove residual noise on edges.
    if min(binary.shape) > 4:
        binary = cv2.erode(binary, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2)))
    # Find connected components, filter by size.
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    h, w = binary.shape
    n_marks = 0
    total_area = 0
    for i in range(1, n_labels):
        cx, cy, cw_comp, ch_comp, area = stats[i]
        # Reject edge-touching: BOTH horizontal edges (border ink stripes)
        spans_h = cx <= 0 and cx + cw_comp >= w
        spans_v = cy <= 0 and cy + ch_comp >= h
        if spans_h or spans_v:
            continue
        if area < 4:
            continue
        if area > 0.7 * cell.size / 3:  # very large = artifact
            continue
        n_marks += 1
        total_area += int(area)
    # Map count to qty
    confidence = 0.9 if n_marks <= 2 else 0.7
    return min(n_marks, 6), confidence


def evaluate_fixture(fixture: str, threshold: int = 100, save_debug: bool = False) -> dict:
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

    correct_pool = correct_deck = total = 0
    per_cell = []
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
            n = len(cards)
            if n == 0:
                continue
            template = TABLE_TEMPLATES.get(tn, TABLE_TEMPLATES["Leaders"])
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            tcrop = warped[y:y + h, x:x + w]

            # Find precise data top
            data_top_rel = find_data_top_anchored(tcrop, template["header_px"])
            row_h = (h - data_top_rel - template["bottom_margin_px"]) / n
            played_x = int(w * template["played_x_frac"])
            played_w = int(w * template["played_w_frac"])
            total_x = int(w * template["total_x_frac"])
            total_w = int(w * template["total_w_frac"])

            # For each row, classify
            sorted_cards = sorted(cards, key=lambda c: int(c["number"]))
            for i, c in enumerate(sorted_cards):
                row_top = int(data_top_rel + i * row_h + 3)
                row_bot = int(data_top_rel + (i + 1) * row_h - 3)
                # Tight inner crop (avoid borders).
                inner_y_inset = max(2, int(row_h * 0.15))
                inner_x_inset_played = max(2, int(played_w * 0.15))
                inner_x_inset_total = max(2, int(total_w * 0.15))
                p_y0 = row_top + inner_y_inset
                p_y1 = row_bot - inner_y_inset
                p_x0 = played_x + inner_x_inset_played
                p_x1 = played_x + played_w - inner_x_inset_played
                t_x0 = total_x + inner_x_inset_total
                t_x1 = total_x + total_w - inner_x_inset_total
                played_cell = tcrop[p_y0:p_y1, p_x0:p_x1]
                total_cell = tcrop[p_y0:p_y1, t_x0:t_x1]
                deck_pred, _ = cell_classify(played_cell, threshold=threshold)
                pool_pred, _ = cell_classify(total_cell, threshold=threshold)

                t_pool, t_deck = truth.get((c["name"], c.get("subtitle") or ""), (0, 0))
                correct_pool += int(pool_pred == t_pool)
                correct_deck += int(deck_pred == t_deck)
                total += 1
                per_cell.append({
                    "card": c["name"], "table": tn, "n": int(c["number"]),
                    "pool_pred": pool_pred, "pool_truth": t_pool,
                    "deck_pred": deck_pred, "deck_truth": t_deck,
                })

    return {
        "fixture": fixture, "method": "option_b_threshold",
        "n_cells_evaluated": total,
        "pool_acc": correct_pool / max(1, total),
        "deck_acc": correct_deck / max(1, total),
        "combined_acc": (correct_pool + correct_deck) / max(1, total * 2),
        "per_cell_predictions": per_cell,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: option_b.py <fixture|all> [--threshold N] [--out PATH]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    threshold = 100
    if "--threshold" in sys.argv:
        threshold = int(sys.argv[sys.argv.index("--threshold") + 1])
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = evaluate_fixture(f, threshold=threshold)
        all_r.append(r)
        print(
            f"{f:<20} pool_acc={100*r['pool_acc']:.1f}% deck_acc={100*r['deck_acc']:.1f}% "
            f"combined={100*r['combined_acc']:.1f}%",
            file=sys.stderr,
        )
    if "--out" in sys.argv:
        with open(sys.argv[sys.argv.index("--out") + 1], "w") as f:
            json.dump(all_r, f, indent=2)
    total_correct = sum(int(r["combined_acc"] * r["n_cells_evaluated"] * 2) for r in all_r)
    total_n = sum(r["n_cells_evaluated"] * 2 for r in all_r)
    print(f"\nOverall: {100 * total_correct / max(1, total_n):.1f}% accuracy", file=sys.stderr)


if __name__ == "__main__":
    main()
