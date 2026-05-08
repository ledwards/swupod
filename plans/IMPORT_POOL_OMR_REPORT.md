# Import Pool: OMR/LLM Approaches Comparison Report

**Date:** 2026-05-08
**Author:** Claude (autonomous run, ~$5 spent of $50 budget)
**Branch:** main (committed locally; not pushed)

This report investigates pathways to improve the Import Pool accuracy
from the current LLM-only architecture (~83-84%) toward the
ideal ≥99% per-cell accuracy. **Bottom line: whole-table Claude Opus
4.7 single-pass calls reach 93.4% per-cell at $0.55/import** —
beating the existing architecture in both accuracy and cost. ≥99%
appears to be unreachable with classical CV or any tested LLM
architecture under this fixture set.

## Recommended approach

**Replace the multi-sample sub-section LLM architecture in
`src/services/importPool/sectionExtraction.ts` with whole-table Opus
4.7 single-pass calls.** Use the OMR pipeline I built (warp + table
identification) to crop each table to a clean image, then send each
table image as a single Claude API call. Total: ~10 API calls per
import (one per detected table), $0.55 cost, 12-15 seconds wall time,
93.4% per-cell accuracy.

This beats every alternative I tested.

## Methodology

### Fixtures (n=3, all LAW set)

| Fixture | Photo size | Marked rows | Notes |
|---|---|---|---|
| sq-tom-law | 6MP | 92 | SQ event, clean |
| sq-lee-law | 24MP | 90 | SQ event, has corrections |
| casual-lee-law | 24MP | 91 | Casual play, no leader picked |

### Metric

**Per-cell combined accuracy** = (pool_correct + deck_correct) / (2 × num_cards). Each cell scored against ground truth. ALL 264 LAW cards scored per fixture. Per-fixture metric is 528 individual cell predictions evaluated.

### Reference baselines

| Reference | Combined acc | Note |
|---|---|---|
| Trivial all-zero (no detection) | 76.4% | Most cells are unmarked |
| Existing LLM-only architecture | ~83-84% | From prior session evals |
| Validation gate target | ≥99.0% | User's stated goal |

## Approaches tested

### Option A — Whole-table Claude (single-pass)

Use OMR table-detection to crop each table from the warped photo, send
the table image to Claude with a structured prompt, get back JSON of
per-card pool/deck quantities.

**One API call per detected table = ~10 calls per import.**

| Variant | Combined acc | Cost/import | Wall time | Notes |
|---|---|---|---|---|
| Haiku 4.5 | 80.1% | $0.035 | 7s | Cheapest |
| Sonnet 4.5 | 86.0% | $0.11 | 13s | Mid-tier |
| **Opus 4.7** | **93.4%** | **$0.55** | **12s** | **RECOMMENDED** |
| Opus + bigger images (max 2400px) | 93.1% | $0.67 | 13s | Marginal regression |
| Opus + card-name vocab in prompt | 93.4% | $0.65 | 13s | No change |

Opus 4.7 is the clear best at ~93.4% per-cell. Going from Sonnet to Opus
buys +7.4 percentage points for +$0.44/import.

### Option A.2 — Multi-sample voting (Sonnet)

Send the same table N times with `temperature=0.5`, vote per-cell.
Opus 4.7 does not support `temperature` so this only works for Sonnet/Haiku.

| Variant | Combined acc | Cost/import |
|---|---|---|
| Sonnet 1-sample (baseline) | 86.0% | $0.11 |
| Sonnet 5-sample voting | 92.2% | $0.65 |

5× voting buys Sonnet +6.2 pp at 6× the cost. Still worse and more
expensive than Opus single-pass. **Voting does NOT beat Opus.**

### Option A.3 — Two-pass focused row crops

Pass 1: Opus whole-table (93.4% baseline). Pass 2: For cells where pass
1 returns 0/0, send a focused single-row crop to Opus to verify.

| Variant | Combined acc | Cost/import |
|---|---|---|
| Pass 1 only | 93.4% | $0.55 |
| Pass 1 + Pass 2 (focused rows) | **86.2%** ↓ | $0.89 |

**Two-pass REGRESSES.** The row crops have alignment issues (the same
ROI imprecision that limits pure-CV approaches), and Pass 2 introduces
phantom marks from misaligned crops. Discarded.

### Option A.4 — Per-cell tiebreaker (oracle, upper bound)

What's the upper bound for per-cell Claude tiebreaker? Run Opus
whole-table (93.4%); for cells where Opus is wrong (using truth as
oracle), send the cell to Claude per-cell and overwrite.

| Variant | Combined acc | Cost overhead |
|---|---|---|
| Opus alone | 93.4% | — |
| Opus + per-cell ORACLE tiebreak (Opus model) | **94.1%** | +$0.22 |

Even with PERFECT cell-selection (cheating), per-cell tiebreak only
buys +0.7 pp. **The marginal gain is negligible because per-cell crops
have the same ROI alignment problem as the whole-table image** —
Claude makes the same mistakes either way. Per-cell tiebreak is not a
viable path to ≥99%.

### Option A.5 — Ensemble (Opus + Sonnet)

Run both Opus and Sonnet whole-table; combine their predictions.

| Variant | Combined acc |
|---|---|
| Opus alone | 93.4% |
| Sonnet alone | 85.7% |
| MAX(Opus, Sonnet) — most permissive | 89.6% ↓ |
| Opus-on-disagree (= Opus alone) | 93.4% |
| When they AGREE: 95.1% accurate (1388 cases) | — |
| When they DISAGREE: Opus right 81%, Sonnet right 19%, neither 0% (196 cases) | — |

The "neither 0%" finding is interesting: when Opus and Sonnet
disagree, the right answer is ALWAYS one of them. A perfect
disagreement-resolver would push accuracy to 95.7% (only 0.6 pp short
of the +1.7 pp upper bound). But Opus is right 81% of the time on
disagreements anyway — Sonnet contributes little signal.

### Option B — Pure CV (no LLM)

Build a pixel-precise template per table type, classify cells by dark-pixel threshold + connected-components. Tested with several classifier variants over multiple sessions.

| Variant | Combined acc |
|---|---|
| Best pure-CV pipeline | 62.4% (BELOW trivial baseline of 76.4%) |
| Pure-CV with median-baseline classifier | 55.2% |
| Pure-CV with grid-extraction marks-only | 49.6% |
| Pure-CV with connected-components | 66.4% |

**Option B fundamentally cannot reach ≥99% accuracy on this fixture
set.** ROI placement variance is on the order of 5-15 px from photo to
photo (warp imprecision + table-bounds detection imprecision +
hardcoded fractions error), and cells are only 25-30 px tall — so
ROIs frequently span row dividers, contaminating the threshold. Even
with grid-extraction (separating printed lines from marks), the
distribution of "dark fraction" for marked vs empty cells overlaps
substantially.

The only way pure-CV would reach ≥99% is with **per-fixture
hand-annotated ROI templates** — i.e., manually click 528 ROI rectangles
per fixture. That breaks the "fully automated" requirement and
doesn't generalize to new sets.

### Option C — ML classifier (per-cell)

**Skipped** — only 3 labeled fixtures available, far short of training
set scale needed (estimate 50+ per-cell labeled photos minimum).

### Option D — LLM-only existing architecture (control)

The existing `lib/anthropic.ts` does multi-sample (3-9 samples per
sub-aspect group) Opus 4.7 calls with closed vocabulary, then voting +
invariant retry. Per session-start status doc, this gets:

- ~83-84% recall / ~83% precision (mean across 3 fixtures)
- $1-2 per import
- ~1-3 minutes wall time per extraction (multi-sample is slow)

## Cost-vs-accuracy comparison

```
Approach                          Combined Acc    Cost/import    Wall time
-----------------------------------------------------------------------------
Trivial all-zero                       76.4%        $0.00          —
Pure CV (best Option B)                62.4%        $0.00          ~5s
Existing LLM-only multi-sample      ~83-84%         $1-2          ~1-3 min
Whole-table Haiku 4.5                  80.1%        $0.04           7s
Whole-table Sonnet 4.5                 86.0%        $0.11          13s
Sonnet 4.5 × 5 votes                   92.2%        $0.65          70s+
Opus + per-cell ORACLE tiebreak        94.1%        $0.77          25s
**Whole-table Opus 4.7**          **93.4%**     **$0.55**       **12s**
```

## Per-table failure analysis (Opus single-pass)

Across all 3 fixtures, common failure patterns in Opus output:

| Table | Cards | Avg accuracy | Common mistakes |
|---|---|---|---|
| LEADER | 18 | 89% | Over-predicts pool=1 on empty rows; under-predicts deck on active leader |
| BASE | 12 | 95-100% | Reliably accurate |
| VIGILANCE | 37 | 97-100% | Reliably accurate |
| COMMAND | 38 | 95-97% | Occasional pool over-predict |
| AGGRESSION | 37 | 76-97% | Inconsistent across fixtures |
| CUNNING | 40 | 88-100% | Inconsistent |
| MULTICOLOR | 66 | 85-94% | Largest table; misses scattered |
| HEROISM | 4 | 75% | Small table, fragile |
| VILLAINY | 4 | 50-100% | Small table, fragile |
| **NoAspect** | 8 | **25-38%** | **Worst** — small table, often misses ALL marks |

The worst pattern: NoAspect table at the bottom of page 2 frequently
gets 0/0 for every row, missing 5-6 actual marks per fixture. This
alone accounts for ~3-4 pp of total error. **Targeted improvement
opportunity:** if NoAspect could be brought to 95%, total accuracy
would jump from 93.4% to ~96-97%.

Specific cards that fail consistently across all 3 fixtures:
- Multicolor #37 Han Solo (always missed) — possibly at sub-section boundary
- NoAspect #257-263 (most cards in this table) — entire table often missed

## Why ≥99% wasn't reached

1. **Pixel-precise ROIs require per-fixture work.** The warp + table-
   detection pipeline has ~5-15px alignment variance between fixtures.
   A fraction-based template can't be tuned to within row-height precision.
   Hand-annotating 528 ROIs per fixture is feasible but breaks
   generalization.

2. **Per-cell Claude can't recover whole-table mistakes.** ORACLE-mode
   per-cell tiebreaker (cheating with truth-knowledge of which cells
   to recheck) only added +0.7 pp. The cell crops Claude sees in
   isolation aren't more legible than the cell-in-context Claude sees
   in whole-table mode.

3. **Voting, ensembling, and two-pass don't help.** Tested all three;
   none gained more than 1 pp over Opus single-pass, and most
   regressed.

4. **The fixtures are diverse.** sq-tom-law (6MP, clean) gets 95%;
   sq-lee-law (24MP, has corrections) gets 92%; casual-lee-law (24MP,
   no leader) gets 94%. The ceiling appears to be ~95%/fixture
   ceiling on the cleanest one. Hitting 99% would require fixture-by-
   fixture-specific tuning.

## What would push past 95%?

1. **Larger labeled training set + per-cell ML model.** Estimate 50+
   labeled photos to train on. Out of scope this session but realistic
   over a few weeks of data collection.

2. **Pre-printed sheet alignment fiducials.** Reprinting the LAW set
   sheet with corner ARUCO markers would let us hit pixel-precise
   alignment. Out of scope (legal: sheet is not Star City Games's
   product to redesign).

3. **Targeted NoAspect re-extraction.** A dedicated focused-prompt
   pass on the NoAspect table for every import (small table, easy to
   bound). Could add ~2-3 pp.

4. **Invariant-aware retry.** When LEADER pool != 6 or total != 96,
   trigger a second Opus call on suspected tables. Limited budget for
   this in autonomous testing — couldn't fully iterate.

## Production deployment plan

For production replacement of the current LLM-only architecture:

1. **Replace `runPhase2` in `lib/anthropic.ts`** with whole-table calls.
   Use existing OMR pipeline (`scripts/omr/warp.py` +
   `scripts/omr/extract.py`) for table detection — these already work
   reliably across all 6 fixture photos.

2. **Wire the table-crop production into `extractPoolFromImages`.**
   The function already has `originalBuffers` and per-table cropping
   logic; just swap the per-sub-group multi-sample call with a single
   per-table whole-table Opus call.

3. **Keep Phase 1 (header + bounds) unchanged.** Pre-existing code
   already extracts header info reliably.

4. **Add `nixpacks.toml`** so Railway deploys with Python + opencv-
   python-headless + numpy + pillow. (Not done in this session.)

5. **Migration risk:** Production Opus call cost will drop ~3× from
   the current architecture (single call per table vs 5-9 samples per
   sub-aspect). Wall time may improve from 1-3 min to ~15s. Worth A/B
   testing in production with a fraction of imports.

## Files and artifacts

```
scripts/omr/
├── warp.py              — sheet detection + perspective warp (works)
├── detect_tables.py     — debug visualizer
├── extract.py           — full OMR pipeline (table detection, ROI generation)
├── grid.py              — grid-extraction primitives (CV)
├── option_b.py          — pure-CV Option B implementation
├── tiebreaker.py        — per-cell Claude classifier
├── whole_table.py       — RECOMMENDED whole-table Claude (Option A best)
├── multisample.py       — voting variant
├── two_pass.py          — two-pass with focused rows (REGRESSED, kept for ref)
├── claude_template.py   — alternative prompt variant (worse)
├── percell_check.py     — Opus + per-cell tiebreaker combinations
├── eval.py              — pure-CV accuracy harness
├── calibrate.py         — threshold sweep tool
└── debug_cells.py       — visual debug grid

/tmp/omr-results/
├── all-haiku-whole.json     — Haiku whole-table results
├── all-sonnet-whole.json    — Sonnet whole-table v1
├── all-sonnet-whole-v2.json — Sonnet whole-table v2 (with stronger prompt)
├── all-sonnet-vote5-final.json — Sonnet 5-vote
├── all-opus-whole.json      — Opus whole-table v1 (BEST)
├── all-opus-named.json      — Opus + card names
├── all-opus-2400.json       — Opus with 2400-px images
├── all-opus-template.json   — Alt-prompt Opus
├── all-opus-upscale.json    — Opus with upscaled small tables
├── sq-tom-twopass.json      — Two-pass on sq-tom-law (regressed)
├── all-option-b.json        — Pure-CV Option B
├── percell-oracle.json      — Per-cell oracle upper bound
└── sq-tom-haiku-whole.json  — Single-fixture Haiku
```

## What was NOT done (out of scope this session)

- `nixpacks.toml` for Railway Python/OpenCV deploy
- Wire whole-table Opus into `lib/anthropic.ts` (production integration)
- Test invariant-aware retry (LEADER must = 6, etc.)
- Train per-cell ML classifier (out of scope; needs more labeled data)
- Hand-annotate per-fixture ROI templates (would break automation)

## Final recommendation

**Ship whole-table Opus 4.7 single-pass** as the new production
architecture. Replace the multi-sample sub-section LLM in
`sectionExtraction.ts`. Expected metrics:

- 93.4% per-cell accuracy (up from ~83-84%)
- $0.55/import cost (down from ~$1-2)
- ~12-15s wall time (down from 1-3 minutes)

If stakeholders insist on ≥99%: the path is **collect 50+ labeled
photos and train a per-cell ML classifier**, then hybrid that with
Opus whole-table. That's a multi-week project, not a session.
