#!/usr/bin/env python3
"""
Production OMR sidecar for Node.

Input (argv or stdin): a list of photo file paths.
Output (stdout, JSON):
  {
    "tables": [
      {
        "name": "Leaders",
        "page": 1,
        "photo_index": 0,
        "image_b64": "...",                     # PNG base64 of the cropped table (canonical/rectified)
        "bounds_canonical": {"x":85,"y":3,"w":673,"h":583},
        "canonical_size": [2200, 1400],
        "bounds_original": {"x0":0.05,"y0":0.28,"x1":0.36,"y1":0.49}, # NORMALIZED [0,1] in the ORIGINAL photo
        "original_size": [2160, 2880]          # post-auto-orient dims (so client maps to displayed image)
      },
      ...
    ],
    "warnings": [...]
  }

The `bounds_original` lets the front-end SourceImageModal crop the
USER'S ORIGINAL upload to just the section they're investigating —
without having to re-warp client-side.
"""
from __future__ import annotations

import base64
import io
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))

from extract import (  # noqa: E402
    detect_canonical_table_rects,
    identify_page_1_tables,
    identify_page_2_tables,
)
from warp import (  # noqa: E402
    detect_table_contours,
    identify_page_from_raw,
    load_oriented,
    printed_area_quad,
    warp_to_canonical,
    canonical_size_for_page,
)


def encode_png_b64(arr: np.ndarray) -> str:
    rgb = cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode("utf-8")


def project_canonical_bounds_to_original(
    canonical_bounds: tuple[int, int, int, int],
    M: np.ndarray,
    original_size: tuple[int, int],
) -> dict:
    """Map a canonical (x, y, w, h) box back to the original photo.

    M is the perspective transform that maps original → canonical.
    We invert M and apply it to the 4 corners of the canonical bounds,
    then take the AABB in original space and normalize to [0,1].
    """
    x, y, w, h = canonical_bounds
    corners = np.array([
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
    ], dtype=np.float32).reshape(-1, 1, 2)
    Minv = np.linalg.inv(M)
    src_corners = cv2.perspectiveTransform(corners, Minv).reshape(-1, 2)
    xs, ys = src_corners[:, 0], src_corners[:, 1]
    ow, oh = original_size
    x0 = float(max(0.0, xs.min() / ow))
    y0 = float(max(0.0, ys.min() / oh))
    x1 = float(min(1.0, xs.max() / ow))
    y1 = float(min(1.0, ys.max() / oh))
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def extract_tables(image_paths: list[str]) -> dict:
    tables = []
    warnings = []
    for photo_idx, path in enumerate(image_paths):
        # Run the warp ourselves (don't use warp.warp_image) so we can
        # keep the perspective matrix M for inverse-projection.
        bgr = load_oriented(Path(path))
        oh_orig, ow_orig = bgr.shape[:2]
        contours = detect_table_contours(bgr)
        if not contours:
            warnings.append(f"photo[{photo_idx}]: no fiducials detected, skipping")
            continue
        page = identify_page_from_raw(contours)
        quad = printed_area_quad(contours)
        warped, M = warp_to_canonical(bgr, quad, page)
        canonical_size = canonical_size_for_page(page)

        rects = detect_canonical_table_rects(warped)
        ident = identify_page_1_tables(rects) if page == 1 else identify_page_2_tables(rects)
        for tn, tb in ident.items():
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            crop = warped[y:y + h, x:x + w]
            bounds_orig = project_canonical_bounds_to_original(
                (x, y, w, h), M, (ow_orig, oh_orig)
            )
            tables.append({
                "name": tn,
                "page": page,
                "photo_index": photo_idx,
                "image_b64": encode_png_b64(crop),
                "bounds_canonical": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                "canonical_size": list(canonical_size),
                "bounds_original": bounds_orig,
                "original_size": [int(ow_orig), int(oh_orig)],
            })
    return {"tables": tables, "warnings": warnings}


def main():
    if "--stdin" in sys.argv:
        spec = json.load(sys.stdin)
    elif len(sys.argv) > 1:
        spec = {"images": sys.argv[1:]}
    else:
        print('Usage: extract_for_node.py <photo1.jpg> [<photo2.jpg> ...]', file=sys.stderr)
        print('   or: echo \'{"images":[...]}\' | extract_for_node.py --stdin', file=sys.stderr)
        sys.exit(1)
    images = spec.get("images") or []
    if not images:
        print(json.dumps({"tables": [], "warnings": ["no images provided"]}))
        return
    try:
        result = extract_tables(images)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"tables": [], "warnings": [f"error: {type(e).__name__}: {e}"]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
