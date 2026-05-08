#!/usr/bin/env python3
"""
Production OMR sidecar for Node.

Input (stdin or argv): JSON like {"images": ["/path/to/photo1.jpg", ...]}
Output (stdout): JSON like:
  {
    "tables": [
      {
        "name": "Leaders",
        "page": 1,
        "photo_index": 0,
        "image_b64": "...",      # PNG base64 of the cropped table
        "bounds": {"x":85,"y":3,"w":673,"h":583},
        "canonical_size": [2200, 1400]
      },
      ...
    ],
    "warnings": [...]
  }

Then Node sends each table to Claude whole-table for classification.
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
from warp import warp_image  # noqa: E402


def encode_png_b64(arr: np.ndarray) -> str:
    rgb = cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode("utf-8")


def extract_tables(image_paths: list[str], save_warps_to: str | None = None) -> dict:
    tables = []
    warnings = []
    for photo_idx, path in enumerate(image_paths):
        out_path = None
        if save_warps_to:
            out_path = Path(save_warps_to) / f"warp-{photo_idx}.png"
            out_path.parent.mkdir(parents=True, exist_ok=True)
        info = warp_image(Path(path), out_path)
        page = info["page"]
        if info["fell_back"]:
            warnings.append(f"photo[{photo_idx}]: fell back to image bounds (no fiducials)")
        # Re-detect tables in the warped image
        warped_path = out_path if out_path else None
        if warped_path:
            warped = cv2.imread(str(warped_path))
        else:
            # Re-warp because warp_image doesn't return the image bytes
            from warp import load_oriented, detect_table_contours, printed_area_quad, warp_to_canonical
            bgr = load_oriented(Path(path))
            corners = detect_table_contours(bgr)
            if corners:
                quad = printed_area_quad(corners)
                warped, _ = warp_to_canonical(bgr, quad, page)
            else:
                warned = True
                warped = bgr
        rects = detect_canonical_table_rects(warped)
        ident = identify_page_1_tables(rects) if page == 1 else identify_page_2_tables(rects)
        for tn, tb in ident.items():
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            crop = warped[y:y + h, x:x + w]
            tables.append({
                "name": tn,
                "page": page,
                "photo_index": photo_idx,
                "image_b64": encode_png_b64(crop),
                "bounds": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                "canonical_size": info["canonical_size"],
            })
    return {"tables": tables, "warnings": warnings}


def main():
    # Read JSON spec from stdin
    if "--stdin" in sys.argv:
        spec = json.load(sys.stdin)
    elif len(sys.argv) > 1:
        # Args are the image paths directly
        spec = {"images": sys.argv[1:]}
    else:
        print('Usage: extract_for_node.py <photo1.jpg> [<photo2.jpg> ...]', file=sys.stderr)
        print('   or: echo \'{"images":[...]}\' | extract_for_node.py --stdin', file=sys.stderr)
        sys.exit(1)
    images = spec.get("images") or []
    save_warps_to = spec.get("save_warps_to")
    if not images:
        print(json.dumps({"tables": [], "warnings": ["no images provided"]}))
        return
    try:
        result = extract_tables(images, save_warps_to=save_warps_to)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"tables": [], "warnings": [f"error: {type(e).__name__}: {e}"]}), file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
