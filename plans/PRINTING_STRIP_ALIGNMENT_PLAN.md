# Printing-strip alignment plan

Status: **RETRACTED / ON HOLD (2026-10-11).** The strong effect came from the title-read boxes 008-011.
On the six number-verified boxes alone it is gone:
- Hyperspace common kit-hit: real 47.2% vs ours 47.3%.
- cov(normal, printed) per card per box: real −0.009 vs ours 0.000. The −0.090 seen with all 9 boxes was
  misreads.
- Normal + normal per kit: real 0.58 vs ours 0.54.

What remains is weak: foil commons kit-hit 41.7% vs 46.5% (about 1.4σ), and commons per kit 5.33 vs
5.73 (about 1.4σ). Nothing to build. Revisit only with more number-verified boxes, and NEVER use
title-read boxes for identity-level analyses: a misread swaps one card's copy for another, which fakes
1- and 3-copy cards, false pairs, and a negative normal/printed covariance.

## The gap

Six-pack kits: we print 6.65 duplicates, the opened ASH boxes show 6.19 ± 0.32. All of it is commons, and
most of it is a hyperspace or hyperspace-foil common landing on a normal copy of the same card already in
the kit.

## Step 1 result — confirmed

Boxes 001-006 (number-verified) plus 008-011. The 008-011 boxes are title-read, but their pos 7
(hyperspace common) and pos 12 (hyperspace foil) printings are fixed by slot and recorded, and their other
commons are normals, so they count for the common strips. Box 007 is missing packs. That's 9 boxes and
393 printed commons; ours is 600 generated boxes.

| | real | ours | z |
|---|---|---|---|
| hyperspace common lands in a kit that holds its normal | 38.0% (n 213) | 46.7% | −2.5 |
| hyperspace foil common lands in a kit that holds its normal | 37.2% (n 180) | 47.2% | −2.7 |
| normal copies at **even** line distance 2-10 per printed common | 0.473 | 0.598 | −3.2 |
| normal copies at **odd** line distance 1-11 per printed common | 0.710 | 0.716 | 0.0 |

Line distance is press order (box position mapped back through `stackBoxOrder`). Even distance means the
same box column, which is where a six-pack kit comes from; odd means the other column.

**Reading.** Both common printing strips avoid putting a card's printed copy in the same column as its
normal copies, and are otherwise unremarkable. Odd distances match ours exactly. An independent shuffle
can't do that; ours is one, which is why we sit at the random 47%. Something ties the printing strip's
order to the normal sheet's order with an odd phase.

The UC3 hyperspace slot (number-verified boxes only, n ≈ 50) matched: 18% vs 18%. It is too small to say
more; revisit with more boxes.

Analysis script: `npx tsx scripts/analyze-strip-alignment.ts [--boxes=800]`.

## What a realistic print sheet looks like

What we know or have good reason to believe:

- TCG sheets are commonly **11 × 11 = 121 positions**. Other layouts happen (10 × 11, 11 × 12, half
  sheets), so the geometry is a parameter to fit, not a constant.
- **Not every position is a card that reaches a pack.** Some positions are discards (registration, color
  bars, crop margin, or a slot that's cut and thrown away), and a set's card count rarely divides 121.
  ASH already shows this on the foil sheet: the config models 15 sheets of 11 × 11 with 5 blanks
  (1810 cards: C15 / U3 / R1 / S5 / L2 copies, `hyperspaceFoilSheetCopies`).
- ASH has 100 commons. Our normal common strip is two lanes of 50 cards × 2 copies = 100 per lane. A
  121-position sheet holding 100 commons leaves 21 positions: discards, or a few cards printed twice.
  Which one changes the repeat structure, and the real per-card frequency data can tell us. If some
  commons were printed twice per sheet, `printerDistribution` would show a two-level frequency split; it
  shows equal frequency today, which favors discards.
- **Doubled sheets are more likely than half sheets:** a half sheet's layout printed twice on one full
  sheet, so every card sits exactly N positions from its own duplicate. The normal common lanes already
  behave this way: each lane prints every common exactly twice, with the second copy 1-9 line packs on
  (96% odd, measured on six verified boxes, `PAIR_PACK_GAPS`). The printed-common sheets may be doubled
  the same way; that sets printed + printed repeats (rare today) and how a printed copy relates to the
  normal run.
- Sheets are cut into **strips** (a row or column of 11), and strips feed the collator's hoppers in order.
  A pack's common slots draw from several hoppers at once: lane A, lane B, the hyperspace-common hopper.
- If the hyperspace common sheet is the **same plate layout** as a normal common sheet (same card
  positions, different finish), and its strips go into their hopper at a fixed lag of k packs behind the
  normal strips, then a card's hyperspace copy lands about k packs from its normal copy. An odd k puts
  it in the other column. That's the observed signature: an even-distance deficit, odd distances
  normal.
- The foil sheet is a different composition (all rarities, 1810 positions across 15 sheets), so it can't
  be a copy of the common plate. Its commons can still be laid out in common-plate order within the foil
  sheet, giving the same parity effect. Its kit-hit drop matching the hyperspace common's says that's
  likely.

## Plan

### 2a. First pass: shared plate with a hopper lag — rejected (2026-10-11)

`scripts/analyze-strip-alignment.ts` fit, per slot, "with probability p the printed common is a copy of
a normal common printed k line packs away", on a continuous simulated press line, against the real
distance profile (0-16) and kit-hit rate.

- Best fit for both strips: |k| ≈ 20-21, p 0.6-1.0, stable at 300 and 800 simulated boxes. Deviance
  gain 13-14 (hyperspace common) and 7-9 (foil commons).
- **Out-of-sample check failed.** The model predicts about twice the real number of normal copies at
  17-23 line packs (0.36 per printed common vs real 0.18 hyperspace, 0.11 foil). It improved the fit by
  pushing copies outside the window it looked at, and real boxes don't have them there.
- What the data does say:
  - The hyperspace common avoids same-column normals locally (even 2-10) and is ordinary at odd and far
    distances.
  - Foil commons avoid normal copies across the whole box: near and far (17-23: real 0.112 vs our 0.188).
- With both fits at p = 1, repeated commons per kit go 5.70 → 5.04 against real 5.33. That's the right
  direction and size, so the effect accounts for the gap; only the mechanism was wrong.

### 2b. Geometry pass (2026-10-11) — shared allotment confirmed, sheet model not yet fitted

- **Doubled printed sheet: not needed.** Printed + printed repeats already match (real 0.361 vs our 0.372
  per kit).
- **Shared allotment: confirmed.** Per card per box, cov(normal copies, printed copies) is −0.090 real vs
  0.001 ours, about 7σ on 900 card-boxes. Printed commons favor cards under-printed as normals in that
  box (normal copies 0 / 1: 4.7% / 27.7% for hyperspace commons vs 1.0% / 17.2% for all commons).
- **Our normal sheet is too rigid.** Normal copies per card per box: variance 0.325 real vs 0.082 ours
  (real 1% / 17% / 73% / 8% / 1% at 0 / 1 / 2 / 3 / 4; ours 91% at exactly 2).
- **Arithmetic:** per lane per box, 96 normal + 12 hyperspace + ~10 foil commons + ~3 discards = 121 =
  one 11×11 sheet.
- **Prototype results:**
  - One shared sheet per lane per box, finishes random by position: overshoots (cov −0.32, normal var
    0.50, total var 0.23).
  - Hoppers drawing random positions from M sheets: right covariance at M ≈ 3 but far too much spread
    (var 1.5). Real hoppers take strips in order, so the next model must cut sheets into strips and
    consume them consecutively.

Targets for 2c (box level): normal var 0.325, total var 0.528 (mean 2.34), cov −0.090. Kit level: printed
kit-hit 38%, repeated commons 5.33 per kit, normal + normal 0.56.

### 2. Fit the sheet model (no generator change)

Fit the smallest physical model that reproduces all four step-1 numbers and the per-distance profile:

- **Geometry:** 11 × 11 with D discards (D fit, 0-21), against 10 × 11 / 11 × 12 alternatives.
- **Shared plate, lagged hopper:** rejected in 2a.
- **One uncut sheet, cut for different hoppers:** normal and printed positions share a sheet, so a card's
  printed copy comes from a different part of the same run than its normals. That predicts box-wide
  avoidance for the foil commons, which is what 2a found. Fit the sheet size, which positions feed which
  hopper, and the discard positions.
- **Doubled printed sheet:** the printed-common sheet is a half sheet twice (copies N apart); fit N
  against printed + printed repeats and the distance profile.
- **Shared lane order only:** the printing strip follows lane A/B and aspect order but shuffles within a
  lane. That's the fallback if the plate model over-fits.

Score each by likelihood of the real distance histogram plus the two kit-hit rates. Fit across all boxes,
never one. Report the per-card frequency each model implies; it must stay equal per card.

### 3. Build it in the strip (printer rules)

- Add a per-set **plate layout** for commons: the card order one print run uses, with its discard
  positions, generated once per box print.
- The normal common lanes and the printing belts (`HyperspaceCommonBelt`, the common run inside
  `HyperfoilBelt`) each take the plate at construction and apply their own cut and hopper lag.
- No belt reads another belt's output or history. They share a printed layout, the way a press shares
  plates. **Needs an explicit sign-off** against `.claude/rules/belt-system.md` ("never couple belts"),
  confirming a static shared layout is not the runtime coupling that rule forbids.
- Equal frequency and an unbiased cut phase stay intact: every card keeps its copy count per boot, and
  the phase is drawn uniformly over the real sheet length. The leader and rare fixes showed what a
  parked or biased phase costs; the discard positions must not park anything either.
- Gated per set (`packRules.printingStripsShareLayout`): ASH first, HMW by inheritance, other sets only
  with their own boxes.

### 4. Prove it

New QA in `src/qa/`:

- Per slot: kit-hit rate within the real 95% interval, plus the even/odd distance split against real.
- Kit totals: six-pack duplicates within ±1 SE of real; the existing KS still passes; normal + normal,
  uncommon and rare repeat rates unchanged.
- `printerDistribution` per-card frequency unchanged.
- `/comps` re-measured: the duplicates cell should land within ~0.1 of 6.2.

### Still worth collecting

- One box photographed as a stack before anything is removed, to settle pull order across the column seam
  (the eight-pack seam window: real 17 vs our 11). Every distance here goes through `stackBoxOrder`.
- More number-verified boxes, mainly for the UC3 hyperspace sheet, which is too small to judge today.

### Expected result

Hyperspace common + normal and foil common + normal each drop to the real ~38% kit-hit rate. Six-pack
duplicates go from 6.65 to about 6.2.
