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
    v_line_xs: list[int]  # x-coords (relative to table) of column dividers


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
    # Light denoise via median blur (3x3) — removes JPEG noise without
    # eroding 1-2px grid lines like morph-open would.
    gray = cv2.medianBlur(gray, 3)
    # Otsu threshold — adapts to per-table brightness. Keep raw binary
    # (no morph denoising) for grid-line detection so thin lines survive.
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    # Vertical lines: column dividers are broken at horizontal crossings,
    # so first CLOSE with a small vertical kernel to bridge those gaps,
    # then OPEN with a long kernel (>>row_h) so only full-table-spanning
    # dividers survive — not single-cell tally marks.
    # Verticals are detected on an UNBLURRED binary: cell dividers are only
    # 1-2px wide and the median blur (needed for h-line stability) erodes
    # them below the opening kernel's reach.
    gray_sharp = cv2.cvtColor(table_bgr, cv2.COLOR_BGR2GRAY)
    _, binary_sharp = cv2.threshold(gray_sharp, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    bridge_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5))
    bridged = cv2.morphologyEx(binary_sharp, cv2.MORPH_CLOSE, bridge_k)
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 60))
    v_lines = cv2.morphologyEx(bridged, cv2.MORPH_OPEN, v_kernel)
    grid = cv2.bitwise_or(h_lines, v_lines)
    dilate_k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grid = cv2.dilate(grid, dilate_k)
    # Marks-only: clean noise via 2x2 open (marks are thicker than 2px,
    # so they survive; isolated noise pixels don't).
    binary_clean = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2)))
    marks = cv2.bitwise_and(binary_clean, cv2.bitwise_not(grid))

    # Find row-divider peaks from h_lines profile. Use a low threshold
    # (0.2) and proper peak-finding so we don't miss faint lines.
    rd = h_lines.sum(axis=1) / 255.0 / h_lines.shape[1]
    line_ys: list[int] = []
    in_band = False
    band_start = 0
    THRESH = 0.2
    for i, d in enumerate(rd):
        if d >= THRESH:
            if not in_band:
                in_band = True
                band_start = i
        else:
            if in_band:
                in_band = False
                # Pick the y position with MAX density within the band
                # (the line's strongest pixel row).
                end = i - 1
                if end - band_start <= 18:
                    sub = rd[band_start:end + 1]
                    peak_offset = int(np.argmax(sub))
                    line_ys.append(band_start + peak_offset)
                else:
                    # Thick band = title bar — use bottom edge.
                    line_ys.append(end)
    if in_band:
        end = len(rd) - 1
        if end - band_start <= 18:
            sub = rd[band_start:end + 1]
            peak_offset = int(np.argmax(sub))
            line_ys.append(band_start + peak_offset)
        else:
            line_ys.append(end)

    # Column-divider peaks from the v_lines profile (same band-peak logic,
    # lower threshold — verticals fragment at subsection breaks so their
    # column density is weaker than full-width horizontals).
    # Low threshold: warp tilt smears a tall divider across several pixel
    # columns, so per-column density lands well under the h-line levels.
    # Band-peak selection still resolves each smear to one x.
    cd = v_lines.sum(axis=0) / 255.0 / max(1, v_lines.shape[0])
    line_xs: list[int] = []
    in_band = False
    band_start = 0
    V_THRESH = 0.05
    for i, d in enumerate(cd):
        if d >= V_THRESH:
            if not in_band:
                in_band = True
                band_start = i
        else:
            if in_band:
                in_band = False
                end = i - 1
                sub = cd[band_start:end + 1]
                line_xs.append(band_start + int(np.argmax(sub)))
    if in_band:
        sub = cd[band_start:]
        line_xs.append(band_start + int(np.argmax(sub)))

    return GridLines(h_lines=line_ys, binary=binary, grid_mask=grid, marks_only=marks, v_line_xs=line_xs)


def derive_row_positions(h_lines: list[int], num_cards: int) -> list[tuple[int, int]] | None:
    """From detected h-line y-positions and known card count, derive
    precise (top, bottom) y bounds for each data row.

    Strategy:
      1. Compute pairwise diffs.
      2. Find the dominant ROW SPACING by clustering diffs in 18-50px
         range (real row heights) and picking the most common bin.
      3. Anchor row 1 top at the LAST h-line before a "data run" of
         consecutive row-spacing diffs.
      4. Extrapolate row positions using dominant_h.
    """
    if len(h_lines) < 4:
        return None
    sorted_lines = sorted(h_lines)
    diffs = [sorted_lines[i + 1] - sorted_lines[i] for i in range(len(sorted_lines) - 1)]
    if not diffs:
        return None

    # Filter to PLAUSIBLE ROW SPACING values (15-60 px in canonical).
    # Below 15 = duplicate detections within one band; above 60 = the
    # column-header gap or skipped rows.
    plausible = [d for d in diffs if 15 <= d <= 60]
    if not plausible:
        return None
    # Most common cluster: bin by 4px increments, pick mode bin's mean.
    from collections import Counter
    binned = Counter(d // 4 for d in plausible)
    mode_bin, _ = binned.most_common(1)[0]
    in_mode = [d for d in plausible if d // 4 == mode_bin]
    dominant_h = float(np.mean(in_mode))

    # Anchor on the LONGEST CONSECUTIVE RUN of row-spacing diffs. This
    # is the run of well-detected row dividers in the data area.
    # Backward-extrapolate from the last line in this run to find
    # row 1's top.
    in_run = False
    runs: list[tuple[int, int]] = []  # (start_diff_idx, end_diff_idx)
    run_start = 0
    for i, d in enumerate(diffs):
        is_row_diff = 0.85 * dominant_h <= d <= 1.15 * dominant_h
        if is_row_diff:
            if not in_run:
                in_run = True
                run_start = i
        else:
            if in_run:
                in_run = False
                runs.append((run_start, i - 1))
    if in_run:
        runs.append((run_start, len(diffs) - 1))
    if not runs:
        return None
    # Longest run = the "data area"
    longest = max(runs, key=lambda r: r[1] - r[0])
    # The line AT diff_idx longest[1] + 1 is the LAST line in the run.
    # That line is at sorted_lines[longest[1] + 1].
    last_in_run = sorted_lines[longest[1] + 1]
    # Step back: the line at sorted_lines[longest[0]] is the FIRST in the run.
    first_in_run = sorted_lines[longest[0]]
    # Number of rows COVERED by this run = (longest[1] - longest[0] + 1) gaps
    # i.e. that many ROW BOUNDARIES → represents that many rows ending at last_in_run.
    n_rows_in_run = longest[1] - longest[0] + 1
    # The last line in this run is the bottom of the last covered row.
    # We need row 1 top such that:
    #   row N top = row 1 top + (N-1) * dominant_h
    #   last covered row bottom = row 1 top + last_row_idx_covered * dominant_h
    # We know last covered row bottom = last_in_run, but we don't know
    # last_row_idx_covered. Constraint: last covered row index ≤ num_cards.
    # Heuristic: the LAST line in our detection is closest to the
    # bottom of the last data row (row num_cards). So:
    #   row num_cards bottom ≈ last_in_run
    #   row 1 top = last_in_run - num_cards * dominant_h
    row1_top = last_in_run - num_cards * dominant_h

    rows: list[tuple[int, int]] = []
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
