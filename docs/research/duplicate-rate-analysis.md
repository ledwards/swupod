# Duplicate-Rate Analysis: Theory vs. Actual, Per Set

**Date:** 2026-06-17
**Author:** generated analysis (`src/qa/duplicateAnalysis.ts`)
**Data artifact:** [`src/data/duplicateStats.json`](../../src/data/duplicateStats.json)
**Live page:** `/qa` → **Duplicates** tab (per set)

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

We compare **three** numbers per set:

### 1. Simulated (Monte Carlo)
N = 2,000 sealed pods per set via `generateSealedPod(set, 6)`, plus box-sampled scenarios
(3-of-24 for draft, 6-of-24 for shuffled-sealed) via `generateSealedBox(set, 24)`. This drives
the production generator, so the belt system, foils, hyperspace, UC3 upgrades and prestige
upgrades are all native. Per pool we record the duplicate count, the full distribution, the
duplicated-card category, and the variant pairing that caused each duplicate.

### 2. Actual (real opened pools, DB)
The `card_pools` table stores the full 96-card list of every opened sealed pool. We project each
pool's card identities (`name|subtitle`) in SQL, count duplicates per pool, and aggregate the mean
and distribution per set — split by the existing `shuffled_packs` flag. This is the ground truth:
what players actually opened. Computed over the most recent pools per set (LAW n≈4,000, SEC
n≈4,000; older/smaller sets fewer). Aggregates only — no per-user data is stored or committed.

### Theoretical model 1 — naive birthday/occupancy (the "wrong" baseline)
Treat every slot as an i.i.d. uniform draw from its rarity pool. Expected duplicate sets =
Σ over rarities of `N·P(Binom(n, 1/N) ≥ 2)`. This **ignores belt collation** and predicts ~15
per 6-pack pool — almost all of it a phantom ~11 from commons.

A simulated version of this (re-assign each card in a real pool a random identity from its
category, with replacement) lands at **~16–17 per pool**. Adding **within-pack de-duplication**
(the basic "no two of the same card in one pack" rule a naive reroll generator would enforce, à la
SWUDraftSim) barely helps — **~15–16 per pool** — because almost all duplicates are *cross-pack*,
not within-pack. **Dedup ≠ collation:** a per-pack reroll leaves ~16 duplicates; only the belt's
cross-pack print-sheet collation reaches ~4. This is the key argument for the belt over a
reroll-based generator.

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

## Validation: simulated vs. actual opened pools

Comparing the simulation to **real opened sealed pools** in the DB (non-shuffled) is the test for
"is the generator behaving, or is there a bug?" Verdict combines effect size (relative difference)
with significance, so huge N alone doesn't trip the flag:

| Set | Simulated | Actual (DB) | n | Δ | Verdict |
|-----|:---:|:---:|:---:|:---:|:---|
| SOR | 4.37 | 4.48 | 382 | +2.4% | ✓ consistent |
| SHD | 4.36 | 4.10 | 182 | −5.8% | ≈ minor drift |
| TWI | 4.33 | 4.91 | 183 | **+13.4%** | ⚠ **investigate** |
| JTL | 4.04 | 3.91 | 244 | −3.3% | ✓ consistent |
| LOF | 4.02 | 4.07 | 425 | +1.1% | ✓ consistent |
| SEC | 3.96 | 4.11 | 4,000 | +3.8% | ✓ consistent |
| LAW | 6.74 | 6.56 | 3,998 | −2.7% | ✓ consistent |
| ASH | 6.61 | 4.36 | 14 | — | sparse (beta) |

Six of eight match the simulation within ~4% — the generator is producing what we model. **TWI is
flagged** (+13.4%, z=2.8): its 183 pools span the set's full lifetime (released 2024-11), so they
include output from older belt versions before recent collation work — most likely **historical
drift, not a current bug**, but worth confirming. ASH has too few opened pools (n=14) to judge.
As more pools are opened, the Actual column tightens automatically.

## Effect of shuffling packs

A sealed pool defaults to packs 0–5 of a 24-pack box (consecutive, one tightly-collated belt run).
The "Randomize Packs" feature replaces them with 6 packs at **random indices across the box**
(`shuffled_packs = true`). Those packs fall outside each belt's 24-card dedup window, so they behave
nearly independently and **normal-vs-normal** common repeats reappear:

| | Not shuffled | Shuffled (6-of-24) | Increase |
|---|:---:|:---:|:---:|
| SOR / SHD / TWI | ~4.3 | **~13.4** | ~3.1× |
| JTL / LOF / SEC | ~4.0 | ~12.0 | ~3.0× |
| LAW / ASH | ~6.7 | ~12.4 | ~1.8× |

**Shuffling roughly triples the duplicate count** (less for LAW/ASH, which already run high from
variants). This is why the per-pool `shuffled_packs` flag matters for stats: shuffled and
non-shuffled pools are different populations and must be compared separately. (Currently ~all opened
pools are non-shuffled, so the Actual column reflects the non-shuffled case.) These shuffled figures
are a simulation prediction — there is not yet enough shuffled DB data to confirm them.

## Variance, explained

Per-pool duplicate counts are a sum of near-independent collision events (Poisson-Binomial), so
**variance ≈ mean**. Sets with more variant cards per pack carry both a higher average and a wider
spread: σ ≈ 1.5 for SOR–SEC (mean ~4) and σ ≈ 1.9 for LAW/ASH (mean ~6.7, the guaranteed hyperspace
common). The high χ²/dof for some sets in the theory comparison is **model bias, not data noise** —
the independent-collision model slightly over-counts (multi-hit) and the test is over-powered at
N=2,000. Shuffling inflates variance further (independent packs). None of this indicates faulty
code; it's the expected statistics of the design.

## Generating these numbers for a new set

The set list is derived from the config registry (`getAllSetCodes()`), so **adding a set config
automatically includes it**. To (re)generate:

```bash
npm run dupe-stats            # all sets, N=2000, refreshes src/data/duplicateStats.json
npm run dupe-stats -- 4000    # larger sample
```

This simulates every set in parallel, queries the DB for the Actual column, and writes the merged
JSON. Good cadence: re-run on each set release (for Simulated/Theoretical) and on a schedule (e.g.
weekly) to refresh Actual as pools accumulate. For Actual to reflect production, run it where
`DATABASE_URL` points at prod (e.g. a Railway cron/one-off); locally it falls back to `.env.local`.

## QA-page performance & caching

The QA set views read two DB-heavy endpoints: `/api/stats/generations` (~10 full
aggregations over 2.3M `card_generations` rows — **~60s on large sets like LAW**) and
`/api/public/pack-quality` (37+ queries). This is **not** a missing index — an index on
`(set_code, generated_at)` exists, but for a large set the filter matches more than half
the table, so Postgres correctly picks a sequential scan. The cost is simply many full
aggregations per request, and the inputs (a few set codes, one start date) change slowly.

Mitigations (implemented):
- **In-process cache** (`lib/statCache`, 30-min TTL) wrapping both endpoints. Railway runs
  one long-lived container, so only the first request per key per TTL computes; every other
  user gets it instantly.
- **`npm run qa-warm`** (`scripts/warmQaCache.ts`) pre-warms every set's caches — run on a
  ~25-min schedule so no real user hits a cold computation. New sets are auto-included.
- **HTTP `Cache-Control`** (`s-maxage` + `stale-while-revalidate`) for browser/CDN reuse.
- **Client-side cache** on the QA page so set/sub-tab switches don't refetch.
- The **Duplicates tab** is served entirely from precomputed `duplicateStats.json` (no DB) —
  instant regardless.

To eliminate the live computation entirely, the next step is to precompute the
generations/quality aggregates to static JSON on a schedule, exactly like `duplicateStats.json`.

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
npm run dupe-stats          # simulate all sets + query DB actual + write src/data/duplicateStats.json
npm run dupe-stats -- 4000  # larger sample

# or the underlying steps (parallelizable):
npx tsx src/qa/duplicateAnalysis.ts 2000 run SOR > /tmp/da_SOR.json   # per set
npx tsx src/qa/duplicateAnalysis.ts 2000 actual                       # DB actual -> /tmp/da_actual.json
DA_DATE=2026-06-17 npx tsx src/qa/duplicateAnalysis.ts 2000 build     # merge -> JSON + summary
```

Supporting exploratory script: `src/qa/_dupSim2.ts`
(`npx tsx src/qa/_dupSim2.ts 1 dump LAW` prints example pods with their duplicate groups).
