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


def cell_rows_for_table(crop_bgr: np.ndarray, table_name: str, emit_thresh: float):
    """Per-row ink stats + strip crops for rows that look inked.

    Uses grid.py primitives: horizontal row dividers + a marks-only mask
    (grid subtracted) so printed lines never count as ink. Returns
    (rows, warning). Rows carry ink fractions for BOTH qty cells; rows
    whose max ink >= emit_thresh also carry a strip_b64 covering
    [PLAYED][TOTAL][NO.#] (Bases: through the name column, since base
    rows have no printed number).
    """
    from grid import extract_grid, COLUMN_FRACS_BY_TABLE

    try:
        g = extract_grid(crop_bgr)
    except Exception as e:  # noqa: BLE001
        return None, f"{table_name}: grid extraction failed: {e}"
    H, W = crop_bgr.shape[:2]

    # Cell x-bounds from DETECTED vertical dividers (the hardcoded column
    # fractions drift with how much margin the table crop includes). The
    # left region of every table reads [border][PLAYED][TOTAL][NO.#...]:
    # take the first dividers left of mid-table and pair them up. Falls
    # back to the legacy fractions when detection comes up short.
    fr = COLUMN_FRACS_BY_TABLE.get(
        table_name, {"PLAYED": (0.04, 0.09), "TOTAL": (0.17, 0.09)}
    )
    played_cell = (int(fr["PLAYED"][0] * W), int((fr["PLAYED"][0] + fr["PLAYED"][1]) * W))
    total_cell = (int(fr["TOTAL"][0] * W), int((fr["TOTAL"][0] + fr["TOTAL"][1]) * W))
    vxs = [x for x in sorted(set(g.v_line_xs)) if x < 0.6 * W]
    # Merge near-duplicate detections (<8px apart).
    merged: list[int] = []
    for x in vxs:
        if merged and x - merged[-1] < 8:
            merged[-1] = (merged[-1] + x) // 2
        else:
            merged.append(x)
    if len(merged) >= 3:
        b, d1, d2 = merged[0], merged[1], merged[2]
        # Sanity: cells should be 25-140px wide in canonical space.
        if 25 <= d1 - b <= 140 and 25 <= d2 - d1 <= 140:
            inset = 3
            played_cell = (b + inset, d1 - inset)
            total_cell = (d1 + inset, d2 - inset)

    strip_x1 = int(W * (0.90 if table_name == "Bases" else 0.45))
    h_lines = sorted(set(int(y) for y in g.h_lines))

    # Gap-fill missed dividers: find the dominant row spacing among
    # detected line pairs, then interpolate lines into any gap that is
    # ≈ an integer multiple of it. Detected lines stay authoritative
    # (no global drift); only the gaps between them get subdivided.
    if len(h_lines) >= 3:
        diffs = [b - a for a, b in zip(h_lines, h_lines[1:])]
        plausible = [d for d in diffs if 15 <= d <= 60]
        if plausible:
            from collections import Counter

            mode_bin, _ = Counter(d // 4 for d in plausible).most_common(1)[0]
            dom = float(np.mean([d for d in plausible if d // 4 == mode_bin]))
            filled = [h_lines[0]]
            for a, b in zip(h_lines, h_lines[1:]):
                gap = b - a
                k = int(round(gap / dom))
                if k >= 2 and abs(gap - k * dom) <= 0.3 * dom:
                    for j in range(1, k):
                        filled.append(int(round(a + j * gap / k)))
                filled.append(b)
            # Extend below the last detected line toward the table bottom
            # (bottom border sometimes goes undetected).
            tail = (H - 1) - filled[-1]
            k = int(round(tail / dom))
            if k >= 1 and abs(tail - k * dom) <= 0.3 * dom:
                base = filled[-1]
                for j in range(1, k + 1):
                    filled.append(int(round(base + j * (tail / k))))
            h_lines = sorted(set(filled))

    # Row-content mask for band re-centering: the printed card numbers /
    # name text in x∈[0.25W, 0.55W] are the strongest per-row signal on
    # the sheet — ruled-line detection drifts, text does not.
    text_region = g.binary[:, int(0.25 * W):int(0.55 * W)]
    text_profile = text_region.sum(axis=1).astype(float)

    def recenter(y0: int, y1: int) -> tuple:
        """Shift a band so it centers on the text row nearest its middle."""
        pad = max(6, (y1 - y0) // 2)
        lo = max(0, y0 - pad)
        hi = min(H, y1 + pad)
        win = text_profile[lo:hi]
        if win.size == 0 or win.max() <= 0:
            return y0, y1
        # Center of mass of text within the widened window.
        ys = np.arange(lo, hi)
        cm = float((ys * win).sum() / win.sum())
        h = y1 - y0
        ny0 = int(round(cm - h / 2))
        ny1 = ny0 + h
        # Only accept modest shifts — a big jump means the window caught a
        # neighboring row's text.
        if abs(ny0 - y0) > h * 0.45:
            return y0, y1
        return max(0, ny0), min(H, ny1)

    rows = []
    for i in range(len(h_lines) - 1):
        y0, y1 = h_lines[i], h_lines[i + 1]
        band_h = y1 - y0
        # Skip duplicate/noise dividers and implausibly tall bands.
        if band_h < 14 or band_h > 140:
            continue
        y0, y1 = recenter(y0, y1)

        def ink_frac(cell_x: tuple) -> float:
            x0 = max(0, cell_x[0])
            x1 = min(W, cell_x[1])
            iy0 = y0 + 4
            iy1 = max(iy0 + 2, y1 - 4)
            cell = g.marks_only[iy0:iy1, x0:x1]
            if cell.size == 0:
                return 0.0
            return float(np.count_nonzero(cell)) / float(cell.size)

        p_ink = ink_frac(played_cell)
        t_ink = ink_frac(total_cell)
        row = {
            "index": len(rows),
            "y0": int(y0),
            "y1": int(y1),
            "played_ink": round(p_ink, 5),
            "total_ink": round(t_ink, 5),
        }
        if max(p_ink, t_ink) >= emit_thresh:
            # Pad generously so the model sees context, then draw RED guides
            # marking the exact target row band and the PLAYED/TOTAL cell
            # boundaries — the reader counts tallies ONLY inside the guides,
            # which kills row-straddle and column-confusion errors.
            pad = 12
            sy0 = max(0, y0 - pad)
            sy1 = min(H, y1 + pad)
            strip = crop_bgr[sy0:sy1, 0:strip_x1].copy()
            scale = 3.0
            strip = cv2.resize(
                strip,
                (int(strip.shape[1] * scale), int(strip.shape[0] * scale)),
                interpolation=cv2.INTER_CUBIC,
            )
            # Draw ONLY the horizontal band guides. Vertical cell brackets
            # were tried and made things worse: detected verticals are too
            # noisy to place reliably, and wrongly-placed guides mislead the
            # reader more than no guides. The printed grid itself is crisp
            # at 3x — the prompt anchors the cells to the printed number.
            RED = (0, 0, 255)
            by0 = int(round((y0 - sy0) * scale))
            by1 = int(round((y1 - sy0) * scale))
            cv2.line(strip, (0, by0), (strip.shape[1] - 1, by0), RED, 2)
            cv2.line(strip, (0, by1), (strip.shape[1] - 1, by1), RED, 2)
            ok, buf = cv2.imencode(".jpg", strip, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            if ok:
                row["strip_b64"] = base64.standard_b64encode(buf.tobytes()).decode("utf-8")
        rows.append(row)
    return rows, None


def extract_tables(image_paths: list[str], cells: bool = False, emit_thresh: float = 0.004) -> dict:
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
            entry = {
                "name": tn,
                "page": page,
                "photo_index": photo_idx,
                "image_b64": encode_png_b64(crop),
                "bounds_canonical": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                "canonical_size": list(canonical_size),
                "bounds_original": bounds_orig,
                "original_size": [int(ow_orig), int(oh_orig)],
            }
            if cells:
                rows, warn = cell_rows_for_table(crop, tn, emit_thresh)
                if warn:
                    warnings.append(warn)
                if rows is not None:
                    entry["rows"] = rows
            tables.append(entry)
    return {"tables": tables, "warnings": warnings}


def main():
    cells = "--cells" in sys.argv
    argv = [a for a in sys.argv[1:] if a not in ("--cells",)]
    if "--stdin" in sys.argv:
        spec = json.load(sys.stdin)
    elif argv:
        spec = {"images": argv}
    else:
        print('Usage: extract_for_node.py <photo1.jpg> [<photo2.jpg> ...]', file=sys.stderr)
        print('   or: echo \'{"images":[...]}\' | extract_for_node.py --stdin', file=sys.stderr)
        sys.exit(1)
    images = spec.get("images") or []
    if not images:
        print(json.dumps({"tables": [], "warnings": ["no images provided"]}))
        return
    try:
        import os
        emit_thresh = float(os.environ.get("CELLS_INK_THRESH", "0.004"))
        result = extract_tables(images, cells=cells, emit_thresh=emit_thresh)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"tables": [], "warnings": [f"error: {type(e).__name__}: {e}"]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
