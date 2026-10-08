#!/usr/bin/env python3
"""
End-to-end OMR eval: run extract on all 3 fixtures (both pages each),
compare against ground truth, report per-cell accuracy + invariants.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))

from extract import extract_one_page  # noqa: E402

FIXTURES = ["sq-tom-law", "sq-lee-law", "casual-lee-law"]


def eval_fixture(name: str) -> dict:
    fix_dir = REPO / "scripts" / "eval" / "fixtures" / name
    with open(fix_dir / "ground-truth.json") as f:
        gt = json.load(f)
    truth = {(row["name"], row.get("subtitle") or ""): (row["poolQty"], row["deckQty"]) for row in gt["rows"]}

    all_cells = []
    for page_num in (1, 2):
        photo = fix_dir / f"photo{page_num}.jpg"
        result = extract_one_page(photo, page_num)
        if "error" in result:
            print(f"  {name} p{page_num}: ERROR: {result['error']}", file=sys.stderr)
            continue
        all_cells.extend(result["cells"])

    correct = wrong = 0
    pool_correct = pool_wrong = 0
    deck_correct = deck_wrong = 0
    for c in all_cells:
        t = truth.get((c["name"], c.get("subtitle") or ""), (0, 0))
        if c["poolQty"] == t[0]:
            pool_correct += 1
        else:
            pool_wrong += 1
        if c["deckQty"] == t[1]:
            deck_correct += 1
        else:
            deck_wrong += 1
    correct = pool_correct + deck_correct
    wrong = pool_wrong + deck_wrong
    total = correct + wrong

    pool_sum = sum(c["poolQty"] for c in all_cells)
    deck_sum = sum(c["deckQty"] for c in all_cells)

    return {
        "fixture": name,
        "cells": len(all_cells),
        "accuracy": correct / total if total else 0,
        "pool_acc": pool_correct / (pool_correct + pool_wrong) if (pool_correct + pool_wrong) else 0,
        "deck_acc": deck_correct / (deck_correct + deck_wrong) if (deck_correct + deck_wrong) else 0,
        "pool_sum": pool_sum,
        "deck_sum": deck_sum,
    }


def main():
    print(f"{'fixture':<20} {'cells':>5} {'acc':>7} {'pool_acc':>9} {'deck_acc':>9} {'pool_sum':>10} {'deck_sum':>10}")
    overall_correct = overall_total = 0
    for fix in FIXTURES:
        r = eval_fixture(fix)
        cells_correct = int(r["accuracy"] * r["cells"] * 2)
        cells_total = r["cells"] * 2
        overall_correct += cells_correct
        overall_total += cells_total
        print(
            f"{r['fixture']:<20} {r['cells']:>5} "
            f"{r['accuracy']*100:>6.1f}% "
            f"{r['pool_acc']*100:>8.1f}% "
            f"{r['deck_acc']*100:>8.1f}% "
            f"{r['pool_sum']:>4}/96    "
            f"{r['deck_sum']:>4}/30-35"
        )
    print(f"\nOverall accuracy: {100*overall_correct/overall_total:.1f}%")


if __name__ == "__main__":
    main()
