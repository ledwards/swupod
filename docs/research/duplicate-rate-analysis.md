# Duplicate-Rate Analysis: Theory vs. Actual, Per Set

**Date:** 2026-06-17
**Author:** generated analysis (`src/qa/duplicateAnalysis.ts`)
**Data artifact:** [`src/data/duplicateStats.json`](../../src/data/duplicateStats.json)
**Live page:** `/duplicate-rates`

---

## Summary

How many **duplicate cards** does a player open per pool, per set? A duplicate here means
**the same card irrespective of variant** — a normal common and the hyperspace common of the
same card are one duplicate (they are the same card for deck-building).

| | Sealed (6-pack pool) | Draft (3-pack pool) |
|---|:---:|:---:|
| **SOR / SHD / TWI** | **~4.4** | ~3.1 |
| **JTL / LOF / SEC** | **~4.0** | ~2.7 |
| **LAW / ASH** | **~6.7** | ~2.9 |

**Every sealed pool contains at least one duplicate** (P(0) ≈ 0.3%). The numbers are driven
almost entirely by the **foil and hyperspace slots**: a variant card lands a second copy of a
card you already opened. LAW/ASH (Block B) run ~50% higher because every pack carries a
**guaranteed hyperspace common** on top of the hyperspace-foil slot.

The result was validated three ways: a naive birthday model (which ignores the belt and is
wrong by 3–4×), a closed-form **variant-collision model** (which matches the generator within
~5–13%), and Monte Carlo over the real generator (the "actual").

---

## What "duplicate" means (and a metric bug we found)

A duplicate set is a card **name** that appears ≥2 times in the pool, with all art treatments
(normal / foil / hyperspace / hyperspace-foil / showcase / prestige) collapsed to one identity.

> ⚠️ **Do not key duplicates on `cardId`.** Card variants are catalogued inconsistently: in
> SOR–SEC a foil shares the base card's `cardId`, but in **LAW each variant printing has its own
> `cardId`**. A `cardId`-keyed count therefore *misses* normal-vs-hyperspace collisions and
> **under-reports duplicates** (e.g. LAW reads ~0 instead of ~6.7; SOR reads ~3.0 instead of
> ~4.4 because it drops the normal+hyperspace pairs). The existing QA baseline in
> `src/qa/packGeneration.test.ts` counts "any treatment" by `cardId` and is low for this reason.
> The correct gameplay-identity key is **name + subtitle**, used throughout this analysis.

---

## Methodology

### Actual (Monte Carlo)
N = 2,000 sealed pods per set via `generateSealedPod(set, 6)`, plus 10,000 draft samples
(3 packs drawn from across a freshly generated 24-pack box via `generateSealedBox(set, 24)`).
This drives the production generator, so the belt system, foils, hyperspace, UC3 upgrades and
prestige upgrades are all native. Per pool we record the duplicate count, the full distribution,
the duplicated-card category, and the variant pairing that caused each duplicate.

### Theoretical model 1 — naive birthday/occupancy (the "wrong" baseline)
Treat every slot as an i.i.d. uniform draw from its rarity pool. Expected duplicate sets =
Σ over rarities of `N·P(Binom(n, 1/N) ≥ 2)`. This **ignores belt collation** and predicts ~15
per 6-pack pool — almost all of it a phantom ~11 from commons.

### Theoretical model 2 — variant-collision (the predictive one)
The belt's boots are **longer than a pool** (commons cycle every 10–12.5 packs, uncommons 20,
leaders 18, bases 8–12, rares ~58), so within a 6-pack pool no belt has wrapped: **normal-vs-normal
repeats ≈ 0**. Duplicates can only come from a **variant card** colliding with a card of the same
name already present. Model each variant card as an independent Bernoulli collision:

```
p(category) = (distinct normal cards of that category in the pool) / (category pool size)
E[duplicates] = Σ over variant cards of p(category of that card)
```

The pool duplicate count is then **Poisson-Binomial** (sum of independent Bernoullis), giving a
full predicted distribution, not just a mean.

### Statistical techniques
- **95% confidence interval** on each Monte-Carlo mean: `mean ± 1.96·sd/√N`.
- **z-score** of (actual − theory) in SE units.
- **Chi-square goodness-of-fit** of the actual duplicate-count histogram against the
  Poisson-Binomial prediction (tails pooled so every expected bin ≥ 5).
- Emphasis on **effect size over p-value**: at N = 2,000 the SE is ≈ 0.03, so a 0.4-card gap is
  ~13σ. The tests are *over-powered*; the practically relevant quantity is the ~5–13% relative gap.

---

## Results

### Per-set: actual vs. theory vs. naive

| Set | Sealed actual (95% CI) | Variant-collision theory | Naive birthday | z | χ²/dof | Draft actual (95% CI) |
|-----|:---:|:---:|:---:|:---:|:---:|:---:|
| SOR | 4.38 [4.31, 4.44] | 4.81 | 15.0 | −13.2 | 20.2 | 3.10 [3.06, 3.14] |
| SHD | 4.33 [4.26, 4.39] | 5.00 | 15.3 | −19.6 | 51.7 | 3.13 [3.09, 3.17] |
| TWI | 4.36 [4.29, 4.43] | 4.82 | 15.0 | −13.6 | 22.2 | 3.12 [3.08, 3.16] |
| JTL | 3.98 [3.91, 4.05] | 4.38 | 14.3 | −11.9 | 15.7 | 2.78 [2.75, 2.82] |
| LOF | 4.07 [4.00, 4.13] | 4.37 | 14.2 | −9.3 | 9.3 | 2.72 [2.68, 2.75] |
| SEC | 3.96 [3.89, 4.02] | 4.52 | 14.6 | −16.8 | 35.4 | 2.74 [2.71, 2.78] |
| LAW | 6.70 [6.62, 6.78] | 6.47 | 14.2 | +5.4 | 3.3 | 2.92 [2.88, 2.95] |
| ASH | 6.65 [6.57, 6.74] | 6.63 | 14.6 | +0.6 | 0.5 | 2.95 [2.91, 2.98] |

**Interpretation.** The naive model is wrong by 3–4× everywhere — the belt collation is doing
exactly its job. The variant-collision model is within **~5–13%** for every set and **near-exact
for the high-variant Block B sets** (ASH z = 0.6, χ²/dof = 0.5). The model is a slight
**over-estimate** for SOR–SEC (multi-hit: a card appearing as normal + foil + hyperspace is one
duplicate set, but the independent model counts each variant as a separate collision) and a slight
**under-estimate** for LAW (it ignores variant-vs-variant collisions, which are common when a pack
has many hyperspace cards). The two biases roughly cancel for LAW/ASH.

### Where the duplicates land (sealed 6-pack, duplicates per pool)

| Set | Leader | Base | Common | Uncommon | Rare | Legendary | Special |
|-----|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| SOR | 0.42 | 0.51 | **2.84** | 0.55 | 0.05 | 0.00 | 0.00 |
| SEC | 0.39 | 0.55 | **2.46** | 0.59 | 0.04 | 0.00 | 0.01 |
| LAW | 0.38 | 0.53 | **4.96** | 0.67 | 0.14 | 0.01 | 0.01 |
| ASH | 0.40 | 0.52 | **4.87** | 0.72 | 0.16 | 0.02 | 0.01 |

Commons dominate (the foil and hyperspace slots are mostly commons). A duplicated **leader**
appears in ~40% of pools and a duplicated **base** in ~50% — a leader/base that also shows up as
its hyperspace/showcase printing. Prestige and legendary collisions are negligible.

### What variant pairing causes each duplicate (sealed 6-pack, per pool)

| | SOR (Block 0) | LAW (Block B) |
|---|:---:|:---:|
| Foil + Normal | 2.89 | — (no regular foils) |
| Hyperspace + Normal | 1.19 | 4.22 |
| HyperspaceFoil + Normal | 0.06 | 2.05 |
| Hyperspace + HyperspaceFoil | — | 0.17 |
| Normal + Prestige | — | 0.03 |
| Normal + Normal | 0.03 | 0.02 |

`Normal + Normal` ≈ 0 confirms the belt eliminates same-printing repeats; every meaningful
duplicate is a **cross-variant** collision — exactly what the foil/hyperspace slots are for.

### Model parameters (why LAW is higher)

The variant *load* per pool is the lever:

| Set | Variant commons / pool | Common collision p | → predicted common dups | actual |
|-----|:---:|:---:|:---:|:---:|
| SOR | 5.90 | 0.587 | 3.46 | 2.84 |
| LAW | **10.26** | 0.478 | 4.90 | 4.96 |

LAW puts **10.3 variant commons** in a 6-pack pool (guaranteed hyperspace common ×6 + hyperspace-foil
commons + upgrades) vs SOR's 5.9, so it lands ~50% more duplicates even though its larger 100-card
common pool gives a slightly lower per-card collision probability.

---

## Draft is structurally different

A 3-pack *draft* pool (~2.7–3.1 duplicates) is modeled as 3 packs sampled from across a 24-pack
box, because a drafter's cards span the whole box rather than one tightly-collated belt run. Unlike
sealed — where all 6 packs share one belt and `Normal + Normal` repeats are ~0 — packs spread across
a box fall outside each belt's 24-card dedup window, so a small number of **normal-vs-normal** common
repeats do occur (~2 per 3-pack pool) on top of the variant collisions. This is the *pack-generation*
contribution only; real pick behavior (drafters favoring the same staples) adds duplicates on top and
is out of scope here.

---

## Key findings

1. **The belt works.** Same-printing duplicates are ~0 per pool; the naive birthday model
   (~15) over-predicts by 3–4× because it ignores print-sheet collation.
2. **Duplicates are variant collisions.** ~4 per sealed pool (SOR–SEC), ~6.7 (LAW/ASH), almost
   all "a card you opened that also appears as a foil/hyperspace." The variant-collision model
   predicts this within ~5–13%.
3. **LAW/ASH run ~50% higher** because of the guaranteed hyperspace common in every pack.
4. **Count duplicates by name, not `cardId`** — the `cardId` key under-reports because LAW
   variants carry distinct `cardId`s. The current QA "any treatment" baseline is low for this reason.

## Caveats
- **Draft model** is the pack-generation contribution (random 3-pack sample from a box); real draft
  pick behavior adds more.
- **ASH is spoiler-beta data** (264 cards, no separate variant entries yet) — it tracks LAW closely
  as expected, but treat its figures as provisional.
- **Over-powered tests:** at N = 2,000 the χ²/z tests formally reject for several sets; this reflects
  the ~5–13% systematic model bias, not a large practical disagreement. Effect sizes are the headline.

## Reproduction
```bash
# Node >= 20 required (cards.json uses JSON import attributes)
# per-set (parallelizable):
npx tsx src/qa/duplicateAnalysis.ts 2000 run SOR > /tmp/da_SOR.json
# ... repeat for each set ...
# merge -> src/data/duplicateStats.json + summary table:
DA_DATE=2026-06-17 npx tsx src/qa/duplicateAnalysis.ts 2000 build
```

Supporting exploratory script: `src/qa/_dupSim2.ts`
(`npx tsx src/qa/_dupSim2.ts 1 dump LAW` prints example pods with their duplicate groups).
