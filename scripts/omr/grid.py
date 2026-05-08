#!/usr/bin/env python3
"""
Grid-extraction OMR primitives.

Approach: separate the printed table grid from the player's marks via
morphological filtering. With grid lines isolated, we can:
  1. Find pixel-exact row positions from horizontal-line peaks
  2. Build a "marks-only" mask by subtracting the grid from the binary
  3. Count ink in each cell on the marks-only mask — robust against
     ROI imprecision because grid pixels are gone

The horizontal-line detection was the breakthrough: a 50px horizontal
opening kernel reliably detects all row dividers across all 4 page-1
tables (LEADER, BASE, VIGILANCE, COMMAND) and the page-2 large tables.

Vertical lines are harder — too short between row dividers — so we use
hardcoded column fractions with empirical inset margins.
"""
from __future__ import annotations

from typing import NamedTuple

import cv2
import numpy as np


class GridLines(NamedTuple):
    """Detected grid for a single table."""
    h_lines: list[int]   # y-coords (relative to table) of row dividers
    binary: np.ndarray   # full-table binary
    grid_mask: np.ndarray  # h_lines + v_lines morphology mask
    marks_only: np.ndarray  # binary AND NOT grid_mask


def extract_grid(table_bgr: np.ndarray) -> GridLines:
    """Extract horizontal/vertical grid lines from a table image.

    Returns a GridLines tuple with h_line y-positions, the table's
    binary, the grid mask, and a marks-only image.

    Pipeline:
      1. Median blur to denoise (removes JPEG noise from high-res scans)
      2. Otsu threshold (binarize ink vs paper)
      3. Morph-open to clean isolated pixel noise
      4. Extract H + V lines via opening with directional kernels
      5. Marks = binary AND NOT (grid OR text)
    """
    gray = cv2.cvtColor(table_bgr, cv2.COLOR_BGR2GRAY)
    # Denoise: median blur removes scattered JPEG noise without blurring
    # crisp grid lines or marks.
    gray = cv2.medianBlur(gray, 3)
    # Otsu threshold — adapts to per-table brightness.
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Remove single-pixel noise: morph open with a 2x2 kernel.
    denoise_k = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, denoise_k)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    # Vertical lines: column dividers are broken at horizontal crossings,
    # so first CLOSE with a small vertical kernel to bridge those gaps,
    # then OPEN with a long kernel (>>row_h) so only full-table-spanning
    # dividers survive — not single-cell tally marks.
    bridge_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5))
    bridged = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, bridge_k)
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 60))
    v_lines = cv2.morphologyEx(bridged, cv2.MORPH_OPEN, v_kernel)
    grid = cv2.bitwise_or(h_lines, v_lines)
    dilate_k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grid = cv2.dilate(grid, dilate_k)
    marks = cv2.bitwise_and(binary, cv2.bitwise_not(grid))

    # Find row-divider peaks from h_lines profile.
    rd = h_lines.sum(axis=1) / 255.0 / h_lines.shape[1]
    line_ys = []
    in_band = False
    band_start = 0
    for i, d in enumerate(rd):
        if d >= 0.4:
            if not in_band:
                in_band = True
                band_start = i
        else:
            if in_band:
                in_band = False
                if 1 <= i - band_start <= 10:
                    line_ys.append((band_start + i - 1) // 2)
                else:
                    # Thick band = title bar (filled colored bar). Use bottom.
                    line_ys.append(i - 1)
    if in_band:
        end = len(rd) - 1
        if end - band_start <= 10:
            line_ys.append((band_start + end) // 2)
        else:
            line_ys.append(end)
    return GridLines(h_lines=line_ys, binary=binary, grid_mask=grid, marks_only=marks)


def derive_row_positions(h_lines: list[int], num_cards: int) -> list[tuple[int, int]] | None:
    """From detected h-line y-positions and known card count, derive
    precise (top, bottom) y bounds for each data row.

    Strategy:
      1. Find the FIRST big gap among consecutive h-lines (= column
         header span). The line ABOVE this gap is the column header
         bottom = TOP OF ROW 1.
      2. Find consistent row spacing from the smallest gaps after that.
      3. If we have num_cards+1 lines after row 1 top, use them directly.
      4. Otherwise, extrapolate using the dominant row spacing.

    Returns None if we can't get a confident grid.
    """
    if len(h_lines) < 4:
        return None
    sorted_lines = sorted(h_lines)
    diffs = [sorted_lines[i + 1] - sorted_lines[i] for i in range(len(sorted_lines) - 1)]
    if not diffs:
        return None

    # Dominant row spacing = MEDIAN of small diffs (excludes the big
    # column-header span and post-table padding).
    sorted_diffs = sorted(diffs)
    # Use the median of the SMALLEST half of diffs (the row-divider gaps).
    half = max(3, len(sorted_diffs) // 2)
    dominant_h = float(np.median(sorted_diffs[:half]))

    # Top of row 1 = first h-line that's followed by a "row-spacing" diff.
    # I.e., the line immediately AFTER the column-header gap.
    row1_top_idx = 0
    for i, d in enumerate(diffs):
        if 0.7 * dominant_h <= d <= 1.3 * dominant_h:
            row1_top_idx = i
            break
    row1_top = sorted_lines[row1_top_idx]
    # Bottom of row N = row1_top + N * dominant_h
    rows = []
    for i in range(num_cards):
        top = row1_top + i * dominant_h
        bot = row1_top + (i + 1) * dominant_h
        rows.append((int(round(top)), int(round(bot))))
    return rows


# Hardcoded column fractions per table type (relative to table width).
# Different tables have slightly different column widths; these are
# empirically measured from the canonical warps.
COLUMN_FRACS_BY_TABLE = {
    # Page 1 tables: PLAYED ~0-14%, TOTAL ~14-29%, NO# ~29-42%
    "Leaders":   {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Bases":     {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Vigilance": {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Command":   {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Aggression":{"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Cunning":   {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Multicolor":{"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Villainy":  {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "Heroism":   {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
    "NoAspect":  {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)},
}
