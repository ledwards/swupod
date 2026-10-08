#!/usr/bin/env python3
"""
Visual debug: render a grid of cells from a table, each labeled with
ground truth + OMR prediction. Lets you see exactly where the classifier
is going wrong.

Usage:
  python3 scripts/omr/debug_cells.py <fixture> <table_name> [--save out.png]

Example:
  python3 scripts/omr/debug_cells.py sq-tom-law Leaders
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))
from extract import extract_one_page  # noqa: E402


def main():
    if len(sys.argv) < 3:
        print("Usage: debug_cells.py <fixture> <table>", file=sys.stderr)
        sys.exit(1)
    fixture = sys.argv[1]
    table_name = sys.argv[2]
    save_path = sys.argv[sys.argv.index("--save") + 1] if "--save" in sys.argv else f"/tmp/omr-debug/{fixture}-{table_name}-grid.png"

    fix_dir = REPO / "scripts" / "eval" / "fixtures" / fixture
    with open(fix_dir / "ground-truth.json") as f:
        gt = json.load(f)
    truth = {row["name"]: (row["poolQty"], row["deckQty"]) for row in gt["rows"]}

    # Run extraction. Determine which photo (page) holds this table.
    PAGE_1 = {"Leaders", "Bases", "Vigilance", "Command"}
    page = 1 if table_name in PAGE_1 else 2
    result = extract_one_page(fix_dir / f"photo{page}.jpg", page)
    cells = [c for c in result["cells"] if c["table"] == table_name]
    if not cells:
        print(f"No cells found for table {table_name}", file=sys.stderr)
        sys.exit(1)

    # Load warped image to crop ROIs from
    warped = cv2.imread(f"/tmp/omr-warped/{fixture}-photo{page}.png")
    if warped is None:
        print(f"Warped image not found at /tmp/omr-warped/{fixture}-photo{page}.png", file=sys.stderr)
        sys.exit(1)

    # Build grid: 1 row per card, 2 cells per row (PLAYED + TOTAL)
    cell_w = 120
    cell_h = 60
    label_w = 280
    rows_n = len(cells)
    out = np.full(((cell_h + 4) * rows_n + 30, label_w + 2 * (cell_w + 4) + 100, 3), 255, dtype=np.uint8)

    cv2.putText(out, f"{fixture} / {table_name}", (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)

    y_offset = 30
    n_correct_pool = 0
    n_correct_deck = 0
    for i, c in enumerate(cells):
        y = y_offset + i * (cell_h + 4)
        t = truth.get(c["name"], (0, 0))

        # Card label
        label = f"#{c['number']:>3} {c['name'][:20]}"
        cv2.putText(out, label, (5, y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)

        # PLAYED cell crop and prediction
        px, py, pw, ph = c["roi"]["played"]
        played_crop = warped[py:py + ph, px:px + pw]
        if played_crop.size > 0:
            played_resized = cv2.resize(played_crop, (cell_w, cell_h), interpolation=cv2.INTER_NEAREST)
            out[y:y + cell_h, label_w:label_w + cell_w] = played_resized
        deck_pred = c["deckQty"]
        deck_truth = t[1]
        deck_color = (0, 180, 0) if deck_pred == deck_truth else (0, 0, 200)
        if deck_pred == deck_truth:
            n_correct_deck += 1
        cv2.putText(out, f"D:{deck_pred}/{deck_truth} c={c.get('deckComponents','?')}",
                    (label_w, y + cell_h + 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, deck_color, 1)

        # TOTAL cell crop and prediction
        tx, ty, tw, th = c["roi"]["total"]
        total_crop = warped[ty:ty + th, tx:tx + tw]
        if total_crop.size > 0:
            total_resized = cv2.resize(total_crop, (cell_w, cell_h), interpolation=cv2.INTER_NEAREST)
            out[y:y + cell_h, label_w + cell_w + 4:label_w + 2 * cell_w + 4] = total_resized
        pool_pred = c["poolQty"]
        pool_truth = t[0]
        pool_color = (0, 180, 0) if pool_pred == pool_truth else (0, 0, 200)
        if pool_pred == pool_truth:
            n_correct_pool += 1
        cv2.putText(out, f"P:{pool_pred}/{pool_truth} c={c.get('poolComponents','?')}",
                    (label_w + cell_w + 4, y + cell_h + 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, pool_color, 1)

    cv2.imwrite(save_path, out)
    print(f"saved {save_path}")
    print(f"Correct pool: {n_correct_pool}/{len(cells)}, deck: {n_correct_deck}/{len(cells)}")


if __name__ == "__main__":
    main()
