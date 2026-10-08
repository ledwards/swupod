# Real Box Data Collection Guide (6-Box ASH Dataset)

Runbook for opening + photographing the 6 ASH boxes so the data answers every
open calibration question. Written 2026-07-04 for the Friday opening; based on
lessons from box 001 (Porg Depot) and pool 002.

## TL;DR checklist per box

1. Number the box (002–007) before opening anything.
2. Photo of the open box top-down BEFORE removing any pack (shows the two columns).
3. Remove packs **left column top→bottom, then right column top→bottom**, keeping order.
4. One photo per pack, cards laid out in the standard grid (below), **all 16 collector
   numbers in frame and in focus**.
5. Zoom-check ONE collector number for sharpness before tearing down each layout.
6. One folder per box. Done.

## Why each step matters

### Box numbering + the pre-opening photo
The whole line/stacking model rests on knowing which physical slot each pack came
from. The top-down photo of the untouched box proves column layout and pack count,
and catches anything odd (shifted packs, partial box). If the box interior differs
from 2×12 columns, photograph it anyway and note it — that's data, not a problem.

### Strict removal order
Photo order IS the position data. Box 001's order (left column top→bottom, then
right) is our reference frame — keep it identical. If a pack gets taken out of
order, don't reshuffle: just note it ("pack 7 photo taken after pack 9").

### The standard 16-card grid (same as box 001)
Lay out each pack's cards in pull order, rows left→right:

| Row | Cards |
|---|---|
| 1 | leader (sideways is fine), base, commons 1–5 |
| 2 | commons 6–9, foil, uncommons 1–2 |
| 3 | uncommon 3, rare/legendary |

Exact row breaks don't matter — what matters is **pull order preserved left→right,
top→bottom**, and no card covering another card's bottom edge. Pool 002's pack 1
was laid out differently and cost analysis time; box 001 pack 4 was blurry and its
16 cards had to be identified by artwork instead of numbers.

### Batch option: 6 packs per layout (2-3 photos per spread)
You can lay out 6 packs at once as 6 rows (one pack per row, 16 cards in pull
order left→right, top row = first pack in removal order). BUT do not shoot the
whole spread as one photo — 16 cards across ≈ 360px per card, and the collector
number lines become unreadable (the readability bar is ~700px of width per card;
box 001 worked at ~750px). Instead shoot each spread as 2-3 OVERLAPPING sections
(e.g. left 8 columns, right 8 columns, generous overlap). ~8-12 photos per box.
PILOT TEST before committing: shoot one spread, zoom into the smallest
farthest-corner card on the phone — if you can read its "N/264" line, go.

### Photo quality bar
- Overhead shot, whole layout in frame, phone parallel to the table.
- **The printed collector number line (bottom-left of every card) is the data.**
  Normal cards print `N/264`; variants print a bare number. If numbers are readable,
  transcription is exact; if not, we're art-matching.
- Foils glare: tilt the card or kill the overhead light rather than accepting a
  white streak across the number.
- Before scooping up the layout: zoom into one card's number on the photo. Sharp?
  Next pack. Blurry? Reshoot — 10 seconds now saves an hour later.
- HEIC straight off the phone is fine. No editing needed.

### Folders
One folder per box: `box-002/`, `box-003/`, … photos in shooting order (the
IMG_ numbering handles this automatically if you shoot in order). If the phone
splits them into multiple archives, that's fine — just don't mix boxes.

Also worth capturing if convenient (optional, seconds each):
- The case: were these 6 boxes from one sealed case? Photo of the case layout
  before unpacking (case-level collation is a real thing we could someday test).
- Box exterior batch/lot codes (bottom flap usually) — lets us correlate print runs.

## What this dataset decides (analysis plan)

Each box yields 24 packs = 4 sealed-pool windows + one stacking-pattern test.
Across 6 boxes (144 packs, 24 pools), in priority order:

1. **Stacking pattern verification** — does the 12,24,11,23,… interleave hold in
   every box? (Tested per box via shared-identity correlation between line-adjacent
   packs, same method that confirmed it on box 001.) Any box that contradicts it
   changes ONE function (`stackBoxOrder`) and nothing else.
2. **The duplicate-tail question** (the big one) — box 001 + pool 002 suggest
   ~half of box-cut pools are duplicate-heavy (≥10 dup identities); all 7 verified
   event pools are clean (4–5). Current shipped model runs knobless at ~6% heavy.
   Decision rule (plans/LINE_STACKING_COLLATION_PLAN.md Phase 4):
   - Boxes show changepoint-shaped duplication (clean start → loaded rest, or
     vice versa) and/or cross-belt co-location → implement the physical
     **stacker-slip / QC pack-drop** mechanism.
   - Loaded pools scattered without structure → recalibrate the pair-gap histogram.
   - Loaded pools rare → box 001 was the outlier; current shipped model stands.
3. **Second-copy distance histogram** — 6 more per-box histograms (gap parity is
   the load-bearing detail).
4. **Rate confirmations** — foil slot C72/U13 (needs ~144 foils to settle),
   prestige 1/12, HS leader & base 1/6, leader+base co-occurrence (~1/36 packs),
   UC3 outcome mix, UC1/UC2 stays 0, showcase (expect 0–1 in 144).
5. **Leader/rare/base line spacing** — validates the Set 7+ windows shipped this week.

## Handoff

Drop the folders anywhere (Downloads is fine) and point Claude at them with the
box numbering. Pipeline from there is automated: HEIC→tiles, transcription agents
reading every printed number, cross-checks against the card DB, per-box CSVs into
`data/real-boxes/ash-box-00N.csv`, then the Phase 4 analysis + re-fit against
`scripts/collation-benchmark.ts`. Box 001 took ~1.5h end-to-end; 6 boxes
parallelize to roughly an afternoon including recalibration.
