#!/usr/bin/env python3
"""
Two-pass approach: count + correction-detection in PARALLEL CALLS.

Pass A (count): regular whole-table counting prompt (best at counting).
Pass B (corrections): focused correction-detection prompt (best at flagging).

Two parallel Opus calls per table. Combine: counts from A, unclear flags
from B.

Eval: cell is "correct" iff (count matches truth) OR (flagged unclear).
The "unclear-credit" represents cells we'd correctly flag for human
review in production, even if the auto-count is wrong.
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from pathlib import Path

import cv2

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))
try:
    from dotenv import load_dotenv
    load_dotenv(REPO / ".env")
    load_dotenv(REPO / ".env.local", override=True)
except ImportError:
    pass

import anthropic  # noqa: E402
from whole_table import (  # noqa: E402
    MODEL_OPUS, PRICING, SYSTEM_PROMPT_TABLE,
    classify_table_async, encode_table_image,
)


SYSTEM_PROMPT_CORRECTIONS = """You inspect a Star Wars: Unlimited sealed deck registration sheet table for player CORRECTIONS.

A correction is a cell where the player crossed out a previously-written mark, OR a judge initialed/signed to verify a value, OR there are clear eraser smudges indicating an edit.

For each card row, identify whether the PLAYED column or TOTAL column shows visible correction signs.

Output JSON:
{"rows": [
  {"n": <card_number>, "p_corrected": <bool>, "t_corrected": <bool>},
  ...
]}

Include only rows where p_corrected OR t_corrected is true. Skip rows with no corrections.

Be SPECIFIC: only flag CLEAR corrections (visible scribble, crossed-out marks, judge signatures, double-marks overwritten on each other). Do NOT flag faint normal-looking marks just because they're light."""


async def detect_corrections(client, table_name, cards, image_b64, model):
    sorted_cards = sorted(cards, key=lambda c: int(c["number"]))
    expected = [int(c["number"]) for c in sorted_cards]
    user_text = (
        f"Table: {table_name}\n"
        f"Expected card numbers: {expected}\n\n"
        f"Identify ONLY rows with CLEAR visible corrections."
    )
    last_e = None
    response = None
    for attempt in range(4):
        try:
            response = await client.messages.create(
                model=model, max_tokens=2000,
                system=[{"type": "text", "text": SYSTEM_PROMPT_CORRECTIONS, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                    {"type": "text", "text": user_text},
                ]}],
            )
            break
        except (anthropic.InternalServerError, anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            last_e = e
            await asyncio.sleep(2 ** attempt)
    if response is None:
        return {}, {"input": 0, "output": 0, "cache_read": 0}
    raw = response.content[0].text if response.content else ""
    parsed = {}
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            payload = json.loads(m.group(0))
            for row in payload.get("rows", []):
                n = int(row["n"])
                parsed[n] = {
                    "p_corrected": bool(row.get("p_corrected", False)),
                    "t_corrected": bool(row.get("t_corrected", False)),
                }
        except Exception as e:
            print(f"  parse failed for {table_name}: {e}", file=sys.stderr)
    usage = response.usage
    return parsed, {
        "input": usage.input_tokens, "output": usage.output_tokens,
        "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
    }


def evaluate_fixture(fixture: str, model=MODEL_OPUS) -> dict:
    from extract import (
        detect_canonical_table_rects, identify_page_1_tables,
        identify_page_2_tables, load_law_cards,
    )
    from warp import warp_image

    fix_dir = REPO / "scripts" / "eval" / "fixtures" / fixture
    with open(fix_dir / "ground-truth.json") as f:
        gt = json.load(f)
    truth = {(row["name"], row.get("subtitle") or ""): (row["poolQty"], row["deckQty"]) for row in gt["rows"]}
    cards_by_t = load_law_cards()

    table_jobs = []
    for page_num in (1, 2):
        photo = fix_dir / f"photo{page_num}.jpg"
        warp_path = Path(f"/tmp/omr-warped/{fixture}-photo{page_num}.png")
        if not warp_path.exists():
            warp_image(photo, warp_path)
        warped = cv2.imread(str(warp_path))
        if warped is None: continue
        rects = detect_canonical_table_rects(warped)
        ident = identify_page_1_tables(rects) if page_num == 1 else identify_page_2_tables(rects)
        for tn, tb in ident.items():
            cards = cards_by_t.get(tn, [])
            if not cards: continue
            x, y, w, h = tb["x"], tb["y"], tb["w"], tb["h"]
            tcrop = warped[y:y + h, x:x + w]
            table_jobs.append((tn, cards, tcrop))

    print(f"  {fixture}: {len(table_jobs)} tables x 2 calls (count + corrections)", file=sys.stderr)

    async def run_all():
        client = anthropic.AsyncAnthropic()
        sem = asyncio.Semaphore(8)

        async def worker(tn, cards, crop):
            async with sem:
                img_b64 = encode_table_image(crop, n_rows=len(cards))
                # Two parallel calls: count + corrections
                count_res, correct_res = await asyncio.gather(
                    classify_table_async(client, tn, cards, img_b64, model=model),
                    detect_corrections(client, tn, cards, img_b64, model),
                )
                return tn, cards, count_res, correct_res

        return await asyncio.gather(*[worker(tn, cards, crop) for tn, cards, crop in table_jobs])

    t0 = time.time()
    results = asyncio.run(run_all())
    elapsed = time.time() - t0

    in_tok = out_tok = cache_tok = 0
    strict_correct = unclear_correct = total = 0
    n_unclear = 0
    per_cell = []
    for tn, cards, count_res, correct_res in results:
        in_tok += count_res.input_tokens
        out_tok += count_res.output_tokens
        cache_tok += count_res.cache_read_tokens
        # correct_res tokens
        # (we don't track them in count_res; capture from a tuple?)
        # The detect_corrections returns (parsed, tokens)
        # But we used (count_res, correct_res) where correct_res is (parsed, tokens)
        # Fix: unpack properly
        corrections_parsed, corrections_tok = correct_res
        in_tok += corrections_tok["input"]
        out_tok += corrections_tok["output"]
        cache_tok += corrections_tok["cache_read"]

        for c in cards:
            n = int(c["number"])
            count_pred = count_res.parsed.get(n, (0, 0))
            corr_pred = corrections_parsed.get(n, {"p_corrected": False, "t_corrected": False})
            pool_pred, deck_pred = count_pred  # (pool, deck) tuple
            t_pool, t_deck = truth.get((c["name"], c.get("subtitle") or ""), (0, 0))
            unclear_flagged = corr_pred["p_corrected"] or corr_pred["t_corrected"]

            both_strict = (pool_pred == t_pool) and (deck_pred == t_deck)
            with_unclear = both_strict or unclear_flagged

            total += 1
            if both_strict: strict_correct += 1
            if with_unclear: unclear_correct += 1
            if unclear_flagged: n_unclear += 1

            per_cell.append({
                "card": c["name"], "table": tn, "n": n,
                "pool_pred": pool_pred, "pool_truth": t_pool,
                "deck_pred": deck_pred, "deck_truth": t_deck,
                "p_corrected": corr_pred["p_corrected"],
                "t_corrected": corr_pred["t_corrected"],
                "strict_correct": both_strict,
                "with_unclear_correct": with_unclear,
            })

    p = PRICING[model]
    cost = (in_tok * p["input"] + out_tok * p["output"] + cache_tok * p["cache_read"]) / 1_000_000
    return {
        "fixture": fixture, "model": model,
        "n_calls": 2 * len(results),
        "n_cells_evaluated": total,
        "strict_correct": strict_correct,
        "with_unclear_correct": unclear_correct,
        "n_unclear_flagged": n_unclear,
        "strict_acc": strict_correct / max(1, total),
        "with_unclear_acc": unclear_correct / max(1, total),
        "input_tokens": in_tok, "output_tokens": out_tok, "cache_read_tokens": cache_tok,
        "cost_usd": cost, "elapsed_s": elapsed,
        "per_cell_predictions": per_cell,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: two_pass_corrections.py <fixture|all> [--model] [--out]", file=sys.stderr)
        sys.exit(1)
    fix = sys.argv[1]
    model = MODEL_OPUS
    if "--model" in sys.argv:
        m = sys.argv[sys.argv.index("--model") + 1]
        model = {"opus": MODEL_OPUS, "sonnet": "claude-sonnet-4-5", "haiku": "claude-haiku-4-5-20251001"}[m]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    fixtures = ["sq-tom-law", "sq-lee-law", "casual-lee-law"] if fix == "all" else [fix]
    all_r = []
    for f in fixtures:
        r = evaluate_fixture(f, model=model)
        all_r.append(r)
        print(
            f"{f:<20} strict={100*r['strict_acc']:.1f}% with_unclear={100*r['with_unclear_acc']:.1f}% "
            f"(unclear_flagged={r['n_unclear_flagged']}) cost=${r['cost_usd']:.3f}",
            file=sys.stderr,
        )
    if out:
        with open(out, "w") as f: json.dump(all_r, f, indent=2)
    total_strict = sum(r["strict_correct"] for r in all_r)
    total_uncl = sum(r["with_unclear_correct"] for r in all_r)
    total_n = sum(r["n_cells_evaluated"] for r in all_r)
    total_cost = sum(r["cost_usd"] for r in all_r)
    print(f"\nOverall STRICT: {100*total_strict/total_n:.1f}% ({total_strict}/{total_n})", file=sys.stderr)
    print(f"Overall WITH UNCLEAR CREDIT: {100*total_uncl/total_n:.1f}% ({total_uncl}/{total_n})", file=sys.stderr)
    print(f"Total cost: ${total_cost:.3f}", file=sys.stderr)


if __name__ == "__main__":
    main()
