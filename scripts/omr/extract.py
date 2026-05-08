#!/usr/bin/env python3
"""
End-to-end OMR extraction for one page of a sealed-pool registration sheet.

Pipeline:
  1. Load + auto-orient photo
  2. Detect printed tables (high-contrast borders) for warp fiducials
  3. Warp to canonical pixel space
  4. Re-detect tables in canonical (now axis-aligned) for ROI placement
  5. Identify each detected table by canonical position
  6. For each card belonging to that table, derive PLAYED + TOTAL cell ROIs
     using the table's bounds + known column proportions + card-list-driven
     row count
  7. Per-cell: threshold + count dark pixels; classify 0/1/2/3+ with
     calibrated thresholds and a per-cell confidence

Output: JSON
  {
    "page": 1 | 2,
    "table_bounds": { "Leaders": [x, y, w, h], ... },
    "cells": [
      { "cardId": "LAW-002", "number": 2, "name": "Tobias Beckett",
        "table": "Leaders", "poolQty": 0, "deckQty": 0,
        "poolDarkFrac": 0.011, "deckDarkFrac": 0.008,
        "poolConfidence": 0.95, "deckConfidence": 0.95,
        "roi": { "played": [x, y, w, h], "total": [x, y, w, h] } },
      ...
    ]
  }

Usage:
  python3 scripts/omr/extract.py <photo.jpg> [page]
    page: 1 (default) or 2
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

from warp import (
    canonical_size_for_page,
    detect_table_contours,
    identify_page_from_raw,
    load_oriented,
    printed_area_quad,
    warp_to_canonical,
)
from grid import COLUMN_FRACS_BY_TABLE, derive_row_positions, extract_grid

# --- Card data ---

MAIN_ASPECTS = {"Vigilance", "Command", "Aggression", "Cunning"}
SECONDARY_ASPECTS = {"Heroism", "Villainy"}

PAGE_1_TABLES = ["Leaders", "Bases", "Vigilance", "Command"]
PAGE_2_TABLES = ["Aggression", "Cunning", "Multicolor", "Villainy", "Heroism", "NoAspect"]


def card_table(c: dict) -> str:
    if c.get("isLeader"):
        return "Leaders"
    if c.get("isBase"):
        return "Bases"
    aspects = c.get("aspects") or []
    mains = [a for a in aspects if a in MAIN_ASPECTS]
    secs = [a for a in aspects if a in SECONDARY_ASPECTS]
    if len(mains) >= 2:
        return "Multicolor"
    if len(mains) == 1:
        return mains[0]
    if len(secs) >= 1:
        return secs[0]
    return "NoAspect"


def card_number(c: dict) -> int:
    return int(c["number"])


def load_law_cards() -> dict[str, list[dict]]:
    """Load LAW cards grouped by table, sorted by card number within each."""
    repo = Path(__file__).resolve().parent.parent.parent
    with open(repo / "src" / "data" / "cards.json") as f:
        data = json.load(f)
    cards = [c for c in data["cards"] if c.get("set") == "LAW" and c.get("variantType") == "Normal"]
    by_table: dict[str, list[dict]] = {}
    for c in cards:
        by_table.setdefault(card_table(c), []).append(c)
    for t in by_table:
        by_table[t].sort(key=card_number)
    return by_table


# --- Table detection in canonical-warped image ---


def identify_page_in_canonical(rects: list[dict], canonical_w: int, canonical_h: int) -> int:
    """Page 1 has at least one wider-than-tall table (BASE/LEADER aspect > 1.0).
    Page 2 has none — all tables tall."""
    for r in rects:
        if r["aspect"] > 1.05:
            return 1
    return 2


def detect_canonical_table_rects(warped: np.ndarray, min_short_frac: float = 0.05) -> list[dict]:
    """Find rectangular table contours in the warped image.

    Looser filter than warp.py's detect_table_contours: post-warp the
    image is axis-aligned and small tables (HEROISM/VILLAINY/NoAspect on
    page 2) need to be detected too.
    """
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    img_area = h * w
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 10
    )
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    img_min = min(w, h)
    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * 0.005 or area > img_area * 0.6:
            continue
        x, y, ww, hh = cv2.boundingRect(c)
        if ww == 0 or hh == 0:
            continue
        long_side = max(ww, hh)
        short_side = min(ww, hh)
        if short_side < img_min * min_short_frac:
            continue
        ratio = short_side / long_side
        if ratio < 0.15:
            # Very thin = likely text bar / logo, not a table
            continue
        # Reject only contours spanning the full canonical width AND
        # height (a defensive page-border catch). MULTICOLOR on page 2 is
        # legitimately ~95% of canonical height — must not be filtered.
        if ww > w * 0.95 and hh > h * 0.95:
            continue
        out.append(
            {
                "x": int(x),
                "y": int(y),
                "w": int(ww),
                "h": int(hh),
                "area": int(area),
                "aspect": ww / hh,
            }
        )
    out.sort(key=lambda r: r["area"], reverse=True)
    return out


def identify_page_1_tables(rects: list[dict]) -> dict[str, dict]:
    """Identify which rect is which on page 1 (LEADER, BASE, VIGILANCE, COMMAND).

    Strategy: the 2 largest tall rects are VIGILANCE + COMMAND (sort by x:
    leftmost = VIGILANCE, rightmost = COMMAND). The remaining 2 wider/square
    tables are LEADER (top) and BASE (bottom), distinguished by y.
    """
    tall = [r for r in rects if r["aspect"] < 1.0]
    wide = [r for r in rects if r["aspect"] >= 1.0]
    # Top 2 tall by area = VIGILANCE + COMMAND
    tall = sorted(tall, key=lambda r: -r["area"])[:2]
    if len(tall) < 2:
        return {}
    tall.sort(key=lambda r: r["x"])
    vig, com = tall[0], tall[1]
    # Top 2 wide by area = LEADER + BASE
    wide = sorted(wide, key=lambda r: -r["area"])[:2]
    if len(wide) < 2:
        return {}
    wide.sort(key=lambda r: r["y"])
    leader, base = wide[0], wide[1]
    return {"Leaders": leader, "Bases": base, "Vigilance": vig, "Command": com}


def identify_page_2_tables(rects: list[dict]) -> dict[str, dict]:
    """Identify page 2 tables.

    Page 2 layout (canonical):
      Top row: AGGRESSION (left), CUNNING (center), MULTICOLOR (right)
      Middle/bottom: VILLAINY, NoAspect, HEROISM (left/center, smaller)

    Strategy: the very-tall (aspect < 0.4) rect on the right is MULTICOLOR.
    The 2 next-largest tall rects are AGGRESSION (left) + CUNNING (center).
    Remaining smaller tables are identified by y-position.
    """
    out: dict[str, dict] = {}
    if not rects:
        return out
    # Tallest rect = MULTICOLOR
    multicolor_candidates = [r for r in rects if r["aspect"] < 0.45]
    if multicolor_candidates:
        # Pick the rightmost very-tall rect
        multi = max(multicolor_candidates, key=lambda r: r["x"])
        out["Multicolor"] = multi
    # Among non-MULTICOLOR rects with aspect 0.4-0.8 (tall but not extreme),
    # the 2 largest are AGGRESSION + CUNNING. AGGRESSION is leftmost.
    used_areas = {(r["x"], r["y"]) for r in [out.get("Multicolor")] if r}
    medium = [r for r in rects if 0.4 < r["aspect"] < 0.8 and (r["x"], r["y"]) not in used_areas]
    medium = sorted(medium, key=lambda r: -r["area"])[:2]
    if len(medium) >= 2:
        medium.sort(key=lambda r: r["x"])
        out["Aggression"] = medium[0]
        out["Cunning"] = medium[1]
    elif len(medium) == 1:
        # Only one detected — fall back: leftmost is AGGRESSION
        out["Aggression"] = medium[0]
    # Smaller tables (aspect > 1.0 wide-ish or aspect 0.8-1.5 squarish)
    # by y-position: VILLAINY top-left, HEROISM bottom-left, NoAspect center.
    used_ids = {id(v) for v in out.values()}
    small = [r for r in rects if id(r) not in used_ids and r["aspect"] > 0.8]
    # Identify by relative position (left vs center, top vs bottom)
    cw, _ = canonical_size_for_page(2)
    small_left = sorted([r for r in small if r["x"] < cw * 0.4], key=lambda r: r["y"])
    small_center = sorted([r for r in small if cw * 0.4 <= r["x"] < cw * 0.7], key=lambda r: r["y"])
    if small_left:
        out["Villainy"] = small_left[0]  # top-left small
        if len(small_left) > 1:
            out["Heroism"] = small_left[-1]  # bottom-left small
    if small_center:
        out["NoAspect"] = small_center[0]
    return out


# --- ROI extraction ---

# Column proportions within each table (fractions of TABLE width).
# These are constants from the printed sheet design — measured from
# canonical warped reference images.
#
# Layout per row, from left to right:
#   PLAYED column | TOTAL column | NO. # column | name + icons column
# PLAYED+TOTAL columns auto-detected per table (vertical-line positions
# within the column-header band). These constants are fallback fractions
# used if auto-detection fails.
COLUMN_FRACS = {
    "PLAYED": (0.04, 0.10),  # x_frac, w_frac (deck qty cell)
    "TOTAL": (0.16, 0.10),  # x_frac, w_frac (pool qty cell)
}

# Top of table contains: colored title bar (e.g., red "LEADER") + "PLAYED
# TOTAL NO.#" column header. Heights vary by table; auto-detect by finding
# the first 2 horizontal-line bands.


def find_column_dividers(warped: np.ndarray, table_bounds: dict, data_top: int) -> list[int]:
    """Find x-coordinates (in canonical) of vertical column-divider lines
    within a table's data region.

    Strategy: column-density profile across the whole data region. Each
    vertical printed line shows up as a peak. Peaks at x_frac roughly
    {0.0, 0.14, 0.28, 0.40, 1.0} are the LEFT BORDER, PLAYED|TOTAL,
    TOTAL|NO#, NO#|NAME, RIGHT BORDER.

    Returns absolute x-coordinates in canonical image space.
    """
    x, y, w, h = table_bounds["x"], table_bounds["y"], table_bounds["w"], table_bounds["h"]
    H, W = warped.shape[:2]
    x0, x1 = max(0, x), min(W, x + w)
    y0, y1 = max(0, data_top), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return []
    region = warped[y0:y1, x0:x1]
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 5
    )
    col_density = binary.sum(axis=0) / 255.0 / binary.shape[0]
    # Peaks: density > 0.7 (most of the column is dark = vertical line)
    peaks: list[int] = []
    in_peak = False
    peak_start = 0
    for i, d in enumerate(col_density):
        if d > 0.7:
            if not in_peak:
                in_peak = True
                peak_start = i
        else:
            if in_peak:
                in_peak = False
                if i - peak_start >= 1:
                    peaks.append((peak_start + i - 1) // 2)
    if in_peak:
        peaks.append((peak_start + len(col_density) - 1) // 2)
    # Convert to absolute canonical x
    return [x0 + p for p in peaks]


def find_horizontal_lines(warped: np.ndarray, table_bounds: dict) -> list[int]:
    """Find y-coordinates of horizontal divider lines spanning the full
    table width.

    Strategy:
      1. Crop the full table region.
      2. Fixed-threshold to binary (gray < 120 = ink).
      3. Morphologically isolate horizontal strokes that span at least
         half the table width.
      4. Row-density profile → identify peaks (rows where most of the
         width is dark = a divider line).
      5. Cluster consecutive peak rows into single line positions.

    Returns absolute y-coords in canonical image space, sorted.
    """
    x, y, w, h = table_bounds["x"], table_bounds["y"], table_bounds["w"], table_bounds["h"]
    H, W = warped.shape[:2]
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(W, x + w)
    y1 = min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return []
    region = warped[y0:y1, x0:x1]
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    # Otsu threshold: adapts to per-table brightness (sq-lee-law photos
    # are mean=169, sq-tom-law are darker; a fixed threshold misses
    # lines on bright photos).
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Kernel width: smaller = better at surviving vertical-line breaks.
    # 25-40px works across all tables; bigger kernel breaks lines apart.
    kernel_w = 30
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, 1))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    row_density = horizontal.sum(axis=1) / 255.0 / horizontal.shape[1]

    # Cluster peak rows into individual lines.
    lines: list[int] = []
    in_band = False
    band_start = 0
    for i, d in enumerate(row_density):
        if d >= 0.4:
            if not in_band:
                in_band = True
                band_start = i
        else:
            if in_band:
                in_band = False
                if i - band_start <= 18:
                    lines.append((band_start + i - 1) // 2)
                else:
                    # A "thick" band is the colored title bar — record
                    # its bottom edge.
                    lines.append(i - 1)
    if in_band:
        end = len(row_density) - 1
        if end - band_start <= 18:
            lines.append((band_start + end) // 2)
        else:
            lines.append(end)
    return [y0 + ly for ly in lines]


def find_data_rows_top(warped: np.ndarray, table_bounds: dict, page: int = 1) -> int:
    """Locate the y-coordinate where data rows START.

    The printed table layout is fixed: a colored title bar (with table
    name and aspect icons) about 30px tall on top of a column header row
    ("PLAYED TOTAL NO.#") about 30px tall, totalling ~60-75px in
    canonical. This is independent of how many cards the table has.
    """
    table_y = table_bounds["y"]
    # Page 1 canonical = 2200x1400; page 2 = 1700x2200. Header heights
    # measured empirically from sq-tom-law fixtures.
    header_h_px = 75 if page == 1 else 65
    return table_y + header_h_px


def cell_roi(
    table_bounds: dict, row_idx: int, column: str,
    data_top: int, row_h: float,
    column_xranges: dict[str, tuple[int, int]] | None = None,
    inner_frac_x: float = 0.5,
    inner_frac_y: float = 0.5,
) -> tuple[int, int, int, int]:
    """Compute (x, y, w, h) ROI for a card's PLAYED or TOTAL cell.

    Returns the CENTER inner_frac × inner_frac region of the cell —
    aggressive inset that excludes cell-border ink even on imprecise
    row/column placement. A pencil tally mark is centered in its cell;
    catching the center 60% reliably hits it while leaving 20% margin
    on each side for border ink.
    """
    x, w = table_bounds["x"], table_bounds["w"]
    cy = data_top + row_idx * row_h
    if column_xranges and column in column_xranges:
        cx, cx1 = column_xranges[column]
        cw = cx1 - cx
    else:
        x_frac, w_frac = COLUMN_FRACS[column]
        cx = x + w * x_frac
        cw = w * w_frac
    # Inset to inner X% × Y% region, centered in the cell.
    inset_x = (cw * (1 - inner_frac_x)) / 2
    inset_y = (row_h * (1 - inner_frac_y)) / 2
    return (
        int(cx + inset_x),
        int(cy + inset_y),
        int(cw * inner_frac_x),
        int(row_h * inner_frac_y),
    )


def column_xranges_for_table(warped: np.ndarray, table_bounds: dict, data_top: int) -> dict[str, tuple[int, int]]:
    """Auto-detect PLAYED and TOTAL column x-ranges by finding vertical
    line peaks within the table's data region.

    Expected layout: 5 vertical lines = (left border, PLAYED|TOTAL,
    TOTAL|NO#, NO#|NAME, right border). The first 4 give us the cell
    boundaries we need.

    Returns {} if auto-detection fails (caller falls back to COLUMN_FRACS).
    """
    peaks = find_column_dividers(warped, table_bounds, data_top)
    x = table_bounds["x"]
    w = table_bounds["w"]
    if len(peaks) < 4:
        return {}
    # The first peak should be near x (left border), second near 14%,
    # third near 28%. Filter to peaks in the left 50% of the table —
    # we don't care about NO#/NAME boundary or right border.
    left_peaks = [p for p in peaks if p < x + w * 0.55]
    if len(left_peaks) < 3:
        return {}
    # Take the leftmost 3 peaks: left_border, PLAYED|TOTAL, TOTAL|NO#.
    border, played_total, total_no = left_peaks[:3]
    # Margin in from each line to avoid catching ink.
    pad = 3
    return {
        "PLAYED": (border + pad, played_total - pad),
        "TOTAL": (played_total + pad, total_no - pad),
    }


# --- Mark counting ---


def count_clean_components(mask: np.ndarray, min_area: int = 4) -> int:
    """Count connected components in a marks-only binary mask.

    With grid lines already removed, components are exclusively player
    marks (or noise). Filter by minimum area to drop JPEG artifacts.
    """
    if mask.size == 0 or mask.max() == 0:
        return 0
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    cnt = 0
    for i in range(1, n_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_area:
            cnt += 1
    return cnt


def classify_grid_marks(density: float, n_components: int) -> tuple[int, float]:
    """Classify mark count.

    Conservative: default to 0 unless we have STRONG evidence of a mark.
    Empty cells produce significant noise via grid removal; real marks
    have density >= 0.05 AND at least one mark-shaped component.
    """
    # Strong empty signal
    if density < 0.04 or n_components == 0:
        return 0, 0.92
    if n_components == 1:
        if density < 0.10:
            return 1, 0.85
        if density < 0.20:
            return 1, 0.7
        return 2, 0.6
    if n_components == 2:
        return 2, 0.9
    if n_components == 3:
        return 3, 0.85
    return min(n_components, 6), 0.7


def threshold_full_image(warped: np.ndarray) -> np.ndarray:
    """Compute a binary mask of TRULY DARK pixels (cutoff < 100).

    Empty cells have min pixel ~150-200 (just paper). Marked cells have
    truly dark pencil/ink at 30-80. Fixed threshold at 100 captures all
    real ink and rejects paper noise / JPEG artifacts (which max ~120).
    """
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    return binary


def cell_marks_signal(binary: np.ndarray, roi: tuple[int, int, int, int]) -> dict:
    """Analyze a cell ROI for mark-shaped connected components.

    Returns:
      {
        "n_components": count of components meeting all filters,
        "total_area": sum of component pixels,
        "dark_frac": dark pixels / total inner pixels (legacy signal),
      }

    Filters out:
      - Components touching the cell border (= cell-border ink leaking in)
      - Very small components (noise)
      - Very long thin components (residual border lines that weren't
        fully filtered by edge-touching alone)
    """
    x, y, w, h = roi
    H, W = binary.shape[:2]
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(W, x + w)
    y1 = min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return {"n_components": 0, "total_area": 0, "dark_frac": 0.0}
    cell = binary[y0:y1, x0:x1].copy()
    if cell.size == 0:
        return {"n_components": 0, "total_area": 0, "dark_frac": 0.0}

    ch, cw = cell.shape
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(cell, connectivity=8)
    n_components = 0
    total_area = 0
    components_detail = []
    for i in range(1, n_labels):  # skip background
        cx, cy, cw_comp, ch_comp, area = stats[i]
        # Edge-touching analysis: which edges does this component touch?
        # Tally marks ("|") legitimately touch top AND bottom (they fill
        # cell height). Border ink leaks usually touch left AND right
        # (a horizontal stroke across the cell) OR all 4 edges.
        touches_left = cx <= 0
        touches_right = cx + cw_comp >= cw
        touches_top = cy <= 0
        touches_bot = cy + ch_comp >= ch
        edge_count = sum([touches_left, touches_right, touches_top, touches_bot])
        # Reject only if BOTH horizontal edges or BOTH vertical edges
        # are touched — these span the cell in one dimension and are
        # almost certainly border ink, not marks. A vertical tally mark
        # touches top+bottom (vertical span) but only one of L/R, so
        # passes.
        spans_horizontally = touches_left and touches_right
        spans_both_dims = edge_count >= 3
        if spans_horizontally or spans_both_dims:
            continue
        # Reject tiny noise.
        if area < 5:
            continue
        # Reject huge components filling most of the cell.
        if area > 0.7 * cell.size:
            continue
        n_components += 1
        total_area += int(area)
        components_detail.append({"area": int(area), "w": int(cw_comp), "h": int(ch_comp)})
    dark_frac = float(cell.sum()) / 255.0 / float(cell.size)
    return {
        "n_components": n_components,
        "total_area": total_area,
        "dark_frac": dark_frac,
        "components": components_detail,
    }


# Classify based on (n_components, total_area). Calibration target: hit
# >=99% on all 3 fixtures.
def classify_marks_components(n_components: int, total_area: int) -> tuple[int, float]:
    """Classify mark count based on filtered connected-component results.

    The connected-components classifier is robust to ROI imprecision
    because the filters (no edge-touching, not too thin) reject border
    ink that bleeds in from misalignment.
    """
    if n_components == 0:
        # Confidence: 1.0 if cell is genuinely empty (low total_area),
        # 0.7 if there's some ink that didn't form a clean component
        # (ambiguous — borderline empty / borderline 1 mark).
        if total_area < 30:
            return 0, 0.95
        return 0, 0.6
    if n_components == 1:
        # 1 mark — high confidence unless the area is unusually large
        # (might be 2 merged tally marks).
        if total_area < 120:
            return 1, 0.95
        if total_area < 250:
            return 1, 0.75
        return 1, 0.55  # likely 1 but could be 2 merged
    if n_components == 2:
        return 2, 0.9
    if n_components == 3:
        return 3, 0.85
    # 4+ components — could be multi-tally or noise; cap at 4
    return min(n_components, 6), 0.6


def classify_marks(delta: float) -> tuple[int, float]:
    """Legacy delta-based classifier — kept for backward compatibility
    until per-table calibration is finalized."""
    DELTA_EMPTY_MAX = 0.02
    DELTA_ONE_MAX = 0.06
    DELTA_TWO_MAX = 0.15
    if delta <= DELTA_EMPTY_MAX:
        return 0, max(0.5, 1.0 - max(0.0, delta) / max(DELTA_EMPTY_MAX, 0.001) * 0.5)
    if delta <= DELTA_ONE_MAX:
        return 1, 0.85
    if delta <= DELTA_TWO_MAX:
        return 2, 0.8
    return 3, 0.7


def classify_dark_frac(dark_frac: float) -> tuple[int, float]:
    """Classify mark count by raw dark fraction in inner-60% ROI.

    With center-only ROI cropping, borders are excluded, so empty cells
    read near 0. Calibrated against ground truth on all 3 fixtures.
    """
    if dark_frac < 0.025:
        return 0, 0.95
    if dark_frac < 0.07:
        return 1, 0.9
    if dark_frac < 0.16:
        return 2, 0.85
    if dark_frac < 0.30:
        return 3, 0.8
    return 4, 0.7


# --- Pipeline ---


def extract_one_page(photo_path: Path, expected_page: int | None = None) -> dict:
    bgr = load_oriented(photo_path)
    h, w = bgr.shape[:2]
    fiducial_corners = detect_table_contours(bgr)
    if not fiducial_corners:
        return {"error": "no fiducials detected", "input": str(photo_path)}
    page = expected_page or identify_page_from_raw(fiducial_corners)
    quad = printed_area_quad(fiducial_corners)
    warped, M = warp_to_canonical(bgr, quad, page)
    cw, ch = canonical_size_for_page(page)

    # Re-detect tables in warped (loose filter for small tables on page 2)
    rects = detect_canonical_table_rects(warped, min_short_frac=0.05)

    if page == 1:
        identified = identify_page_1_tables(rects)
    else:
        identified = identify_page_2_tables(rects)

    cards_by_table = load_law_cards()

    cells = []
    for table_name, table_bounds in identified.items():
        cards = cards_by_table.get(table_name, [])
        n = len(cards)
        if n == 0:
            continue

        # GRID EXTRACTION: separate printed grid lines from marks. Gives
        # us pixel-exact row bounds AND a clean marks-only mask.
        x, y, w, h = table_bounds["x"], table_bounds["y"], table_bounds["w"], table_bounds["h"]
        tcrop = warped[y:y + h, x:x + w]
        grid = extract_grid(tcrop)
        rows = derive_row_positions(grid.h_lines, n)

        # Get column fractions for this table type.
        col_frac = COLUMN_FRACS_BY_TABLE.get(table_name, {"PLAYED": (0.05, 0.12), "TOTAL": (0.18, 0.12)})

        # Fallback row layout when grid detection fails (small tables).
        if rows is None:
            data_top_abs = find_data_rows_top(warped, table_bounds, page)
            data_top_rel = data_top_abs - y
            row_h = (h - data_top_rel) / n
            rows = [(int(data_top_rel + i * row_h), int(data_top_rel + (i + 1) * row_h)) for i in range(n)]

        for i, card in enumerate(cards):
            row_top, row_bot = rows[i]
            row_h = row_bot - row_top
            # Inset rows slightly to avoid catching the row-divider line
            # itself (already removed by grid mask, but defensive).
            inner_y = row_top + 2
            inner_h = max(1, row_h - 4)

            played_x_frac, played_w_frac = col_frac["PLAYED"]
            total_x_frac, total_w_frac = col_frac["TOTAL"]
            played_x = int(w * played_x_frac)
            played_w = int(w * played_w_frac)
            total_x = int(w * total_x_frac)
            total_w = int(w * total_w_frac)

            # Count dark pixels in MARKS-ONLY mask (grid removed) per cell.
            played_cell = grid.marks_only[inner_y:inner_y + inner_h, played_x:played_x + played_w]
            total_cell = grid.marks_only[inner_y:inner_y + inner_h, total_x:total_x + total_w]
            played_marks_count = int(played_cell.sum() / 255) if played_cell.size > 0 else 0
            total_marks_count = int(total_cell.sum() / 255) if total_cell.size > 0 else 0
            played_density = played_marks_count / max(1, played_cell.size)
            total_density = total_marks_count / max(1, total_cell.size)

            # Connected components for tally counting (when present).
            played_n_comp = count_clean_components(played_cell)
            total_n_comp = count_clean_components(total_cell)

            deck_qty, deck_conf = classify_grid_marks(played_density, played_n_comp)
            pool_qty, pool_conf = classify_grid_marks(total_density, total_n_comp)

            cells.append(
                {
                    "cardId": card["cardId"],
                    "number": card_number(card),
                    "name": card["name"],
                    "table": table_name,
                    "poolQty": pool_qty,
                    "deckQty": deck_qty,
                    "poolDensity": round(total_density, 4),
                    "poolComponents": total_n_comp,
                    "deckDensity": round(played_density, 4),
                    "deckComponents": played_n_comp,
                    "poolConfidence": round(pool_conf, 3),
                    "deckConfidence": round(deck_conf, 3),
                    "roi": {
                        "played": [x + played_x, y + inner_y, played_w, inner_h],
                        "total": [x + total_x, y + inner_y, total_w, inner_h],
                    },
                }
            )

    return {
        "input": str(photo_path),
        "page": page,
        "tables_detected": [r for r in rects],
        "tables_identified": {k: [v["x"], v["y"], v["w"], v["h"]] for k, v in identified.items()},
        "cells": cells,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: extract.py <photo.jpg> [page]", file=sys.stderr)
        sys.exit(1)
    photo = Path(sys.argv[1])
    page = int(sys.argv[2]) if len(sys.argv) > 2 else None
    result = extract_one_page(photo, page)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
