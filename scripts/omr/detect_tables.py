#!/usr/bin/env python3
"""
Detect the major printed tables on a registration sheet.

The sheet has high-contrast black-bordered tables at fixed positions:
  Page 1: LEADER (small, top-left), BASE (small, bottom-left),
          VIGILANCE (large, center), COMMAND (large, right)
  Page 2: AGGRESSION, CUNNING, MULTICOLOR (large), VILLAINY,
          HEROISM, NO ASPECTS

These borders are the most reliable fiducials we have because:
  - High contrast (black on white)
  - Known absolute positions on the printed sheet
  - Multiple per page (homography over-determined)

Usage:
  python3 scripts/omr/detect_tables.py <input.jpg> [debug.png]

Prints JSON of detected rectangles. If debug.png is given, draws boxes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps


def load_oriented(path: Path) -> np.ndarray:
    pil = Image.open(path)
    pil = ImageOps.exif_transpose(pil)
    rgb = np.array(pil.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    if w > h:
        bgr = cv2.rotate(bgr, cv2.ROTATE_90_CLOCKWISE)
    return bgr


def detect_table_rects(bgr: np.ndarray, min_area_frac: float = 0.01) -> list[dict]:
    """Find rectangular contours that look like printed tables.

    Returns list of {x, y, w, h, area, aspect, is_quad} dicts in source pixels.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    img_area = h * w

    # Adaptive threshold handles uneven lighting better than Otsu on hand
    # held phone photos. blockSize must be odd; large enough to span a
    # full table cell.
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 10
    )

    # Tables have rectangular borders. Use edge detection on the binary
    # to thin the strokes, then find contours.
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    rects = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * min_area_frac:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        x, y, ww, hh = cv2.boundingRect(c)
        if ww == 0 or hh == 0:
            continue
        aspect = ww / hh
        rects.append(
            {
                "x": int(x),
                "y": int(y),
                "w": int(ww),
                "h": int(hh),
                "area": int(area),
                "aspect": float(aspect),
                "is_quad": len(approx) == 4,
                "peri": float(peri),
            }
        )

    rects.sort(key=lambda r: r["area"], reverse=True)
    return rects


def annotate(bgr: np.ndarray, rects: list[dict], out_path: Path):
    """Draw bounding boxes onto a copy of the image and save it."""
    img = bgr.copy()
    colors = [(0, 255, 0), (0, 200, 255), (255, 0, 255), (255, 255, 0), (0, 0, 255), (255, 0, 0)]
    for i, r in enumerate(rects[:10]):
        c = colors[i % len(colors)]
        cv2.rectangle(img, (r["x"], r["y"]), (r["x"] + r["w"], r["y"] + r["h"]), c, 6)
        cv2.putText(
            img,
            f"#{i} {r['w']}x{r['h']}",
            (r["x"] + 10, r["y"] + 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.5,
            c,
            4,
        )
    cv2.imwrite(str(out_path), img)


def main():
    if len(sys.argv) < 2:
        print("Usage: detect_tables.py <input.jpg> [debug.png]", file=sys.stderr)
        sys.exit(1)
    input_path = Path(sys.argv[1])
    debug_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    bgr = load_oriented(input_path)
    rects = detect_table_rects(bgr)

    if debug_path:
        annotate(bgr, rects, debug_path)

    h, w = bgr.shape[:2]
    print(json.dumps({"input": str(input_path), "size": [w, h], "rects": rects[:15]}, indent=2))


if __name__ == "__main__":
    main()
