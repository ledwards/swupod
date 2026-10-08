#!/usr/bin/env python3
"""
Per-cell Claude classifier for OMR tiebreaker.

Approach: take the ROI bounds my OMR pipeline produces for each cell,
crop them out, send each crop to Claude with a small classification
prompt, get back the mark count.

Variants supported:
  - per-cell: 1 image per call (most accurate, most expensive)
  - per-row: 1 image per row showing PLAYED + TOTAL (half the calls)
  - per-table: 1 image per table (cheapest, may lose precision)

Uses prompt caching on the system prompt to reduce input cost on the
~250-cell-per-import call volume.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Load .env from repo root so ANTHROPIC_API_KEY is in env.
REPO = Path(__file__).resolve().parent.parent.parent
try:
    from dotenv import load_dotenv

    load_dotenv(REPO / ".env")
    load_dotenv(REPO / ".env.local", override=True)
except ImportError:
    pass

import anthropic  # noqa: E402

# Pricing: pinned models. Haiku 4.5 is cheapest, Sonnet 4.6 is the
# next tier. Pricing is per-million-tokens and updates over time, but
# the relative order is stable.
MODEL_HAIKU = "claude-haiku-4-5-20251001"
MODEL_SONNET = "claude-sonnet-4-5"  # 4.5 is currently latest sonnet alias
MODEL_OPUS = "claude-opus-4-7"


@dataclass
class CellAsk:
    """One cell to ask Claude about. crop is BGR np.ndarray."""
    cell_id: str
    column: str  # "PLAYED" or "TOTAL"
    crop: np.ndarray
    truth: int | None = None  # ground truth if known (for eval)


@dataclass
class CellAnswer:
    cell_id: str
    column: str
    qty: int  # 0-6
    raw: str  # raw model response
    confidence: float  # 0-1
    cost_input_tokens: int = 0
    cost_output_tokens: int = 0
    cache_read_tokens: int = 0


@dataclass
class CallStats:
    n_calls: int = 0
    n_cells: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_create_tokens: int = 0
    elapsed_s: float = 0.0
    errors: list[str] = field(default_factory=list)

    def cost_usd(self, model: str) -> float:
        # Approximate per-million-token prices (USD). Haiku 4.5 is
        # cheapest, Sonnet 4.6 is medium, Opus 4.7 is most expensive.
        prices = {
            MODEL_HAIKU: (1.0, 5.0, 0.10),  # input, output, cache_read
            MODEL_SONNET: (3.0, 15.0, 0.30),
            MODEL_OPUS: (15.0, 75.0, 1.50),
        }
        ipx, opx, crx = prices.get(model, (3.0, 15.0, 0.3))
        return (
            self.input_tokens * ipx
            + self.output_tokens * opx
            + self.cache_read_tokens * crx
        ) / 1_000_000.0


def encode_crop(crop: np.ndarray, max_dim: int = 256) -> str:
    """Encode an OpenCV BGR ndarray as base64 PNG, resized to max_dim
    on the longest side. Smaller images cost fewer tokens."""
    h, w = crop.shape[:2]
    scale = max_dim / max(h, w)
    if scale < 1.0:
        new_w, new_h = int(w * scale), int(h * scale)
        crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.standard_b64encode(buf.getvalue()).decode("utf-8")


SYSTEM_PROMPT_PER_CELL = """You read tally-mark counts from registration-sheet cells.

You will be shown a small image of one rectangular cell from a deck registration sheet. The cell either:
- Is empty (no marks) - reply 0
- Has 1 mark (a single tally stroke "|", a check mark, or the digit "1") - reply 1
- Has 2 marks ("||" or "2") - reply 2
- Has 3 marks ("|||" or "3") - reply 3
- Has 4 marks ("||||" or "4") - reply 4
- Has 5 marks - reply 5
- Has 6 marks - reply 6

Important rules:
- ONLY count marks IN the cell. Ignore printed grid borders / lines along edges. Ignore content from neighboring cells.
- A small dot or smudge is 0, not a mark.
- If you see eraser smudges or a crossed-out / corrected number, reply with the visible CURRENT value (not the crossed-out one). If genuinely unclear, reply with your best guess.
- Reply with EXACTLY one digit 0-6. No other text. No explanation."""


async def classify_one_cell_async(
    client: anthropic.AsyncAnthropic,
    cell: CellAsk,
    model: str = MODEL_HAIKU,
    max_dim: int = 256,
) -> tuple[CellAnswer, dict]:
    """Classify a single cell. Returns (answer, raw_usage_dict)."""
    img_b64 = encode_crop(cell.crop, max_dim=max_dim)
    response = await client.messages.create(
        model=model,
        max_tokens=8,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT_PER_CELL,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": img_b64,
                        },
                    },
                    {"type": "text", "text": "How many marks?"},
                ],
            }
        ],
    )
    raw = response.content[0].text.strip() if response.content else ""
    qty = 0
    confidence = 0.5
    for ch in raw:
        if ch.isdigit():
            qty = int(ch)
            confidence = 0.9
            break
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
    }
    answer = CellAnswer(
        cell_id=cell.cell_id,
        column=cell.column,
        qty=qty,
        raw=raw,
        confidence=confidence,
        cost_input_tokens=usage["input_tokens"],
        cost_output_tokens=usage["output_tokens"],
        cache_read_tokens=usage["cache_read_input_tokens"],
    )
    return answer, usage


async def classify_cells(
    cells: list[CellAsk],
    model: str = MODEL_HAIKU,
    concurrency: int = 16,
    max_dim: int = 256,
) -> tuple[list[CellAnswer], CallStats]:
    """Classify all cells with bounded concurrency."""
    client = anthropic.AsyncAnthropic()
    sem = asyncio.Semaphore(concurrency)
    stats = CallStats(n_cells=len(cells))
    answers: list[CellAnswer | None] = [None] * len(cells)

    async def worker(idx: int, cell: CellAsk):
        async with sem:
            for attempt in range(3):
                try:
                    answer, usage = await classify_one_cell_async(client, cell, model=model, max_dim=max_dim)
                    answers[idx] = answer
                    stats.n_calls += 1
                    stats.input_tokens += usage["input_tokens"]
                    stats.output_tokens += usage["output_tokens"]
                    stats.cache_read_tokens += usage["cache_read_input_tokens"]
                    stats.cache_create_tokens += usage["cache_creation_input_tokens"]
                    return
                except (anthropic.APIError, anthropic.APIConnectionError) as e:
                    if attempt == 2:
                        stats.errors.append(f"{cell.cell_id}: {type(e).__name__}: {str(e)[:120]}")
                        answers[idx] = CellAnswer(
                            cell_id=cell.cell_id, column=cell.column, qty=0,
                            raw="", confidence=0.0,
                        )
                        return
                    await asyncio.sleep(0.5 * (attempt + 1))

    t0 = time.time()
    await asyncio.gather(*[worker(i, c) for i, c in enumerate(cells)])
    stats.elapsed_s = time.time() - t0
    out = [a for a in answers if a is not None]
    return out, stats


def crop_cell(image: np.ndarray, roi: tuple[int, int, int, int], pad: int = 6) -> np.ndarray:
    """Crop a cell with a few pixels of padding. Caller decides image
    space (warped vs raw)."""
    x, y, w, h = roi
    H, W = image.shape[:2]
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(W, x + w + pad)
    y1 = min(H, y + h + pad)
    return image[y0:y1, x0:x1].copy()


def main():
    """CLI entry: test single-cell classification on a fixture's
    LEADER table. Saves JSON output and prints accuracy summary."""
    if len(sys.argv) < 2:
        print("Usage: tiebreaker.py <fixture> [--model haiku|sonnet|opus] [--limit N]", file=sys.stderr)
        sys.exit(1)
    fixture = sys.argv[1]
    model = MODEL_HAIKU
    limit = None
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"haiku": MODEL_HAIKU, "sonnet": MODEL_SONNET, "opus": MODEL_OPUS}[m]
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    table_filter = sys.argv[sys.argv.index("--table") + 1] if "--table" in sys.argv else None

    sys.path.insert(0, str(REPO / "scripts" / "omr"))
    from extract import extract_one_page

    fix_dir = REPO / "scripts" / "eval" / "fixtures" / fixture
    with open(fix_dir / "ground-truth.json") as f:
        gt = json.load(f)
    truth = {(row["name"], row.get("subtitle") or ""): (row["poolQty"], row["deckQty"]) for row in gt["rows"]}

    cells_to_ask: list[CellAsk] = []
    cell_meta: dict[str, dict] = {}

    for page_num in (1, 2):
        photo = fix_dir / f"photo{page_num}.jpg"
        warped = cv2.imread(f"/tmp/omr-warped/{fixture}-photo{page_num}.png")
        if warped is None:
            from warp import warp_image as _warp
            _warp(photo, Path(f"/tmp/omr-warped/{fixture}-photo{page_num}.png"))
            warped = cv2.imread(f"/tmp/omr-warped/{fixture}-photo{page_num}.png")
        result = extract_one_page(photo, page_num)
        for c in result["cells"]:
            if table_filter and c["table"] != table_filter:
                continue
            t_pool, t_deck = truth.get((c["name"], c.get("subtitle") or ""), (0, 0))
            played_crop = crop_cell(warped, c["roi"]["played"])
            total_crop = crop_cell(warped, c["roi"]["total"])
            played_id = f"{c['cardId']}/PLAYED"
            total_id = f"{c['cardId']}/TOTAL"
            cells_to_ask.append(CellAsk(played_id, "PLAYED", played_crop, truth=t_deck))
            cells_to_ask.append(CellAsk(total_id, "TOTAL", total_crop, truth=t_pool))
            cell_meta[played_id] = {"name": c["name"], "table": c["table"], "card_number": c["number"]}
            cell_meta[total_id] = {"name": c["name"], "table": c["table"], "card_number": c["number"]}

    if limit:
        cells_to_ask = cells_to_ask[:limit]

    print(f"Asking Claude ({model}) about {len(cells_to_ask)} cells...", file=sys.stderr)
    answers, stats = asyncio.run(classify_cells(cells_to_ask, model=model))

    # Score
    correct = wrong = 0
    by_truth = {}
    for a in answers:
        cell = next(c for c in cells_to_ask if c.cell_id == a.cell_id)
        truth_qty = cell.truth if cell.truth is not None else 0
        is_correct = a.qty == truth_qty
        correct += int(is_correct)
        wrong += int(not is_correct)
        by_truth.setdefault(truth_qty, [0, 0])
        by_truth[truth_qty][0] += int(is_correct)
        by_truth[truth_qty][1] += 1

    print(f"\nAccuracy: {correct}/{len(answers)} = {100*correct/max(1,len(answers)):.1f}%", file=sys.stderr)
    print(f"Per-truth breakdown:", file=sys.stderr)
    for truth_qty, (c, n) in sorted(by_truth.items()):
        print(f"  truth={truth_qty}: {c}/{n} = {100*c/max(1,n):.1f}%", file=sys.stderr)
    print(f"Stats: {stats.n_calls} calls, {stats.elapsed_s:.1f}s elapsed", file=sys.stderr)
    print(f"  input_tokens={stats.input_tokens} output={stats.output_tokens} cache_read={stats.cache_read_tokens}", file=sys.stderr)
    print(f"  cost: ${stats.cost_usd(model):.4f}", file=sys.stderr)

    out = {
        "fixture": fixture,
        "model": model,
        "answers": [
            {
                "cell_id": a.cell_id,
                "column": a.column,
                "qty": a.qty,
                "raw": a.raw,
                "truth": next((c.truth for c in cells_to_ask if c.cell_id == a.cell_id), None),
                "card": cell_meta.get(a.cell_id, {}),
            }
            for a in answers
        ],
        "stats": {
            "n_calls": stats.n_calls,
            "elapsed_s": stats.elapsed_s,
            "input_tokens": stats.input_tokens,
            "output_tokens": stats.output_tokens,
            "cache_read_tokens": stats.cache_read_tokens,
            "cost_usd": stats.cost_usd(model),
            "errors": stats.errors[:10],
        },
        "accuracy": correct / max(1, len(answers)),
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
