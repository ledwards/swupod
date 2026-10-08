# OMR Pivot — Session Status (2026-05-08, second session)

This file is the honest status at the end of this session. Read
[IMPORT_POOL_OMR_PIVOT.md](IMPORT_POOL_OMR_PIVOT.md) first for the
broader context on the LLM→OMR decision.

## TL;DR

I built the pipeline end-to-end (warp → table-detect → row/grid extract
→ classify), but it currently performs **at ~50-66% per-cell accuracy
across 3 fixtures**, which is **below the trivial baseline of "always
predict 0" (76.4%)**. The OMR is adding noise rather than signal.

Hitting **≥99% per-cell** requires fundamentally different work than
what I attempted in this session. Honest options below.

## What was built and is working

- **`scripts/omr/warp.py`** — auto-orient + sheet warp using the union
  of detected table corners as fiducials. Page identification via
  presence of an extreme-aspect (MULTICOLOR) table. Page-specific
  canonical sizes (page 1 = 2200×1400, page 2 = 1700×2200). Verified
  on all 6 fixture photos.
- **`scripts/omr/extract.py`** — table identification (LEADER, BASE,
  VIGILANCE, COMMAND on page 1; MULTICOLOR, AGGRESSION, CUNNING,
  HEROISM, VILLAINY, NoAspect on page 2) by canonical position +
  size + aspect. Identifies all 4-6 tables on every fixture.
- **`scripts/omr/grid.py`** — grid extraction via morphology. Detects
  horizontal divider lines reliably (works on 25/30 fixture×table
  combinations); derives precise per-row y-positions from the line
  spacing. Vertical column dividers are unreliable to extract because
  they break at horizontal-line crossings; use hardcoded column
  fractions instead.
- **`scripts/omr/eval.py`** — per-cell accuracy harness against
  ground truth on all 3 fixtures.
- **`scripts/omr/calibrate.py`** — threshold sweep tool that exposes
  the signal-quality ceiling.
- **`scripts/omr/debug_cells.py`** — visual debug grid that renders
  each cell with truth/prediction labels for inspection.

## The accuracy ceiling

```
fixture              cells     acc  pool_acc  deck_acc
sq-tom-law             264   53.4%     37.1%     69.7%
sq-lee-law             264   39.6%     26.1%     53.0%
casual-lee-law         264   55.7%     43.6%     67.8%
Overall                       49.6%

Trivial (all-zero):             76.4%
LLM baseline (prior arch):      ~83-84%
Validation gate target:         ≥99.0%
```

## Why my pipeline is below baseline

The classifier is producing too many FALSE POSITIVES (predicting
non-zero when actual is zero). Concretely:

1. **Empty-cell density distribution** has long tail:
   ```
   Empty POOL:   median=0.003   90th=0.084   99th=0.241
   Empty DECK:   median=0.000   90th=0.062   99th=0.242
   ```
   That means ~10% of empty cells have density above 0.06 — well into
   "marked" territory by any threshold I tried.

2. **Marked-cell density distribution** has high zero rate:
   ```
   Marked POOL:  median=0.003   10th=0.000
   Marked DECK:  median=0.000   10th=0.000
   ```
   Most actually-marked cells read as if they were empty — because
   the grid-extraction's vertical kernel was catching tally marks
   (they're 15-20px vertical strokes; the kernel min-height was 12px).
   Bumping the kernel up loses too many true column dividers
   (broken at row crossings).

3. **Per-fixture noise differs**: sq-lee-law and casual-lee-law are
   24MP photos with significant JPEG noise survival. sq-tom-law is 6MP
   and noticeably cleaner.  A single threshold can't span both.

## What I tried this session (all in code)

- Hard-coded header height and uniform row spacing (~50% accuracy)
- Median-relative dark-fraction classification (~55%)
- Per-cell connected-components classifier with edge-touching filter
  (~66% peak, dropped on tally-mark edge-touching)
- Center-50% ROI inset (~67%)
- Fixed-threshold 100 vs Otsu vs adaptive (~50-55%)
- Grid extraction via morphology (~50-60%, sensitive to tuning)
- Bridge-then-open for vertical lines (~50%)
- Median blur denoising before threshold (~54%)
- Conservative classifier (~61%)

Each tweak helps one fixture and hurts another.

## Why ≥99% is hard with this approach

Production OMR systems hit 99%+ via one of:

1. **Pre-printed alignment marks** (fiducials at corners/edges).
   Letting the form designer guarantee per-cell pixel positions.
   The LAW registration sheet has no such fiducials.

2. **Per-cell ML classifier trained on labeled marks.** Robust to
   lighting/noise variation but requires a labeled dataset (we have
   3 fixtures with ground truth — that's far short of training-set
   scale).

3. **Controlled scanning conditions** (flatbed scanner, fixed
   lighting). Phone photos have variable everything.

Without pre-printed fiducials and with only 3 labeled examples, the
ROI registration error budget is too tight for classical CV
(threshold + components) to hit 99% reliably.

## Honest options for next session

### Option A — Accept hybrid OMR + Claude

Use OMR to:
- Detect the table BOUNDS (works reliably)
- Compute per-cell ROIs (precision ~5-10px, good enough for cropping)

Then send each cell ROI as a tiny image crop to Claude with a
fixed prompt: "How many tally marks?" Claude operates on a clean
30×60px crop and gets the answer right.

- Cost: ~250 cells × $0.001 = ~$0.25/import, much less than current
  Claude-based architecture.
- Accuracy: likely 95%+ because Claude is good at this kind of
  small-image classification.
- Implementation: takes ~half a session.

### Option B — Pixel-precise template registration

Hand-annotate exact (x,y,w,h) for every PLAYED+TOTAL ROI on a
**reference photo** (one fixture, one set). Save as JSON template.
For new photos, register them to the reference using feature matching
(ORB/SIFT) + homography. Every ROI then lands at pixel-precise
position.

- Tedious one-time cost: ~250 cards × 2 columns = 500 ROIs to
  hand-annotate per set.
- Once done, ROI placement is exact and threshold-based classification
  becomes viable.
- Generalizes to future sets only if you do this work per set.

### Option C — Train a per-cell ML classifier

Cell-image → mark-count regression. Needs:
- A labeled dataset bigger than 3 fixtures (say, 50+ photos with
  per-cell labels).
- Training infrastructure (PyTorch, CV labels tooling).

Out of scope for this branch but feasible.

### Option D — Stop and ship LLM-only

The current LLM-only path achieves ~83-84% recall/precision. That's
worse than what we want, but better than my OMR. If neither of A/B/C
will land in time, the LLM path is the production fallback.

## Files in this branch (all uncommitted)

```
scripts/omr/
├── warp.py          (sheet detection + canonical warp; works)
├── detect_tables.py (debug visualizer; works)
├── extract.py       (full pipeline; current accuracy 49-66%)
├── grid.py          (grid extraction primitives)
├── eval.py          (per-cell eval against ground truth)
├── calibrate.py     (threshold sweep tool)
└── debug_cells.py   (per-cell visual debug)

src/data/omr-templates/   (empty; no template JSON yet)

plans/
├── IMPORT_POOL_OMR_PIVOT.md   (original plan; not edited)
└── IMPORT_POOL_OMR_STATUS.md  (this file)
```

## What I did NOT do

- Did not write `nixpacks.toml`.
- Did not build the Claude tiebreaker (Option A).
- Did not integrate into `extractPoolFromImages`.
- Did not commit. The user has explicitly said `git push` requires
  permission, and they mentioned merging to main themselves.
- Did not push.

## Recommendation

I would do **Option A** in the next session — it's the path to a
working production result fastest, and the accuracy gap from the
LLM-only baseline (84%) to the validation gate (97%) can be made up
by Claude-tiebreaker on the cells where my OMR is uncertain. That's
the architecture the original plan doc proposed (Phase B), and my
current OMR work IS the foundation for it: bounding boxes per cell.
