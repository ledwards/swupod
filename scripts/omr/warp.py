#!/usr/bin/env python3
"""
Sheet-to-canonical perspective warp using DETECTED TABLE CORNERS as fiducials.

Earlier approach (largest white quadrilateral) was unreliable: backgrounds
bleed in (sq-lee-law has comic books behind the sheet), or cards above the
sheet get included in the contour (sq-tom-law).

New approach: detect the printed black-bordered tables (LEADER, BASE,
VIGILANCE, COMMAND on page 1; AGGRESSION, CUNNING, MULTICOLOR + smaller
tables on page 2). They are high-contrast and at known positions, so the
union of their corners reliably bounds the printed area regardless of
photo background.

Pipeline:
  1. Auto-orient (EXIF + landscape -> portrait)
  2. Adaptive threshold to extract dark printed elements
  3. Find rectangular contours (the table borders)
  4. Filter: aspect 0.25-1.7, area > 1% image, < 60% image
  5. Compute oriented bounding rect of all corners (printed-area quad)
  6. Warp that quad to canonical CANONICAL_W x CANONICAL_H

Usage:
  python3 scripts/omr/warp.py <input.jpg> [<output.png>]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

# Canonical pixel dimensions for the warped PRINTED AREA, per page.
# Page 1 printed area is wider than tall (LEADER+VIG+COM across the top,
# BASE bottom-left, then white space). Aspect ~1.55. Use 2200 x 1400.
# Page 2 is taller than wide (MULTICOLOR runs full height; the 6 tables
# stack vertically). Aspect ~0.77. Use 1700 x 2200.
CANONICAL_PAGE_1 = (2200, 1400)
CANONICAL_PAGE_2 = (1700, 2200)
# Backwards-compat alias used by older imports — use the page 2 size.
CANONICAL_W, CANONICAL_H = CANONICAL_PAGE_2


def canonical_size_for_page(page: int) -> tuple[int, int]:
    return CANONICAL_PAGE_1 if page == 1 else CANONICAL_PAGE_2


def load_oriented(path: Path) -> np.ndarray:
    pil = Image.open(path)
    pil = ImageOps.exif_transpose(pil)
    rgb = np.array(pil.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    if w > h:
        bgr = cv2.rotate(bgr, cv2.ROTATE_90_CLOCKWISE)
    return bgr


def detect_table_contours(bgr: np.ndarray) -> list[np.ndarray]:
    """Find contours of printed tables. Returns ordered 4-corner arrays.

    Uses the rotated minimum-area rectangle of each contour (preserves
    tilt) rather than axis-aligned bounding boxes.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    img_area = h * w

    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 10
    )
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    out = []
    for c in contours:
        area = cv2.contourArea(c)
        # Min: 1% of image (filters small text). Max: 50% (filters page
        # border / full-image quads). Page border on sq-tom-law photo2 is
        # ~58% of image so 50% is the right cut-off.
        if area < img_area * 0.01 or area > img_area * 0.5:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) > 8:
            continue
        # Use rotated bounding rect (captures tilt). minAreaRect returns
        # a rotated rect; boxPoints expands to 4 corners.
        rotated = cv2.minAreaRect(c)
        (cx, cy), (rw, rh), angle = rotated
        if rw == 0 or rh == 0:
            continue
        long_side = max(rw, rh)
        short_side = min(rw, rh)
        ratio = short_side / long_side  # always 0..1
        # Tables: short/long ratio >= 0.25 (tall MULTICOLOR is the limit;
        # below that is footer logos / "A LAWLESS TIME" bar / cards-at-top).
        if ratio < 0.25:
            continue
        # Min short side: real data tables have a minimum thickness. On
        # 2160-wide photos the thinnest data table (BASE) is ~464px short;
        # footer logos are ~200px, cards-at-top ~288px. 14% of image-min
        # dimension keeps the smallest data tables and rejects logos.
        img_min = min(w, h)
        if short_side < img_min * 0.14:
            continue
        box = cv2.boxPoints(rotated)
        # Reject anything spanning ~the full image (page borders, mats).
        xs, ys = box[:, 0], box[:, 1]
        aabb_w = xs.max() - xs.min()
        aabb_h = ys.max() - ys.min()
        if aabb_w > w * 0.85 or aabb_h > h * 0.85:
            continue
        out.append((order_corners(box), float(area)))

    out.sort(key=lambda x: x[1], reverse=True)
    return [c for c, _ in out]


def order_corners(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def printed_area_quad(table_corners: list[np.ndarray]) -> np.ndarray:
    """Compute the rotated rectangle that bounds all detected table corners.

    Each table contributes 4 corners (already rotated/tilt-aware). The
    minAreaRect of all these points gives the printed-area quad.
    """
    if not table_corners:
        raise ValueError("No table rectangles detected; can't bound printed area")
    pts = np.concatenate(table_corners, axis=0).astype(np.float32)
    rotated = cv2.minAreaRect(pts)
    box = cv2.boxPoints(rotated)
    return order_corners(box)


def warp_to_canonical(
    bgr: np.ndarray, corners: np.ndarray, page: int = 2
) -> tuple[np.ndarray, np.ndarray]:
    """Warp to the canonical pixel size for the given page (1 or 2)."""
    cw, ch = canonical_size_for_page(page)
    dst = np.array([[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(corners, dst)
    warped = cv2.warpPerspective(bgr, M, (cw, ch))
    return warped, M


def identify_page_from_raw(table_corners: list[np.ndarray]) -> int:
    """Identify the page from raw-photo table corners.

    Page 2's MULTICOLOR table is reliably very tall (aspect < 0.4) and
    is detected on every page-2 fixture; no page-1 table has aspect
    that extreme (page 1's tallest, VIG/COM, are 0.55-0.74). This is
    sharper than checking for wider-than-tall tables, because page 2's
    smaller HEROISM/VILLAINY/NoAspect tables can be wider than tall.
    """
    for c in table_corners:
        xs, ys = c[:, 0], c[:, 1]
        w = xs.max() - xs.min()
        h = ys.max() - ys.min()
        if w > 0 and h > 0 and (w / h) < 0.4:
            return 2
    return 1


def warp_image(
    input_path: Path,
    output_path: Path | None = None,
    page: int | None = None,
) -> dict:
    bgr = load_oriented(input_path)
    h, w = bgr.shape[:2]
    table_corners = detect_table_contours(bgr)
    if not table_corners:
        corners = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
        fell_back = True
        if page is None:
            page = 2  # arbitrary default
    else:
        corners = printed_area_quad(table_corners)
        fell_back = False
        if page is None:
            page = identify_page_from_raw(table_corners)
    warped, M = warp_to_canonical(bgr, corners, page)
    cw, ch = canonical_size_for_page(page)
    if output_path is not None:
        cv2.imwrite(str(output_path), warped)
    return {
        "input": str(input_path),
        "output": str(output_path) if output_path else None,
        "input_size": [w, h],
        "canonical_size": [cw, ch],
        "page": page,
        "fell_back": fell_back,
        "table_count": len(table_corners),
        "corners": corners.tolist(),
        "perspective_matrix": M.tolist(),
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: warp.py <input.jpg> [<output.png>]", file=sys.stderr)
        sys.exit(1)
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    info = warp_image(input_path, output_path)
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
