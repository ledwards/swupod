# Line + Stacking Collation (Set 7+) — Test-First Plan

**Goal:** make generated 6-pack sealed pools and 24-pack draft boxes statistically
indistinguishable from real ones, by modeling what the factory actually does:
belts fill packs in **line order** with simple physical rules, then packs are
**stacked into the box** in two interleaved columns, and players consume the box
top-down by column.

**Evidence base:** real ASH box 001 (24 packs, slot-level, `data/real-boxes/ash-box-001.csv`),
pool 002 (6 prerelease packs — intra-pack/aggregate use only), 8 real LAW event pools
(`scripts/eval/fixtures/`). Full findings: `plans/ASH_COLLATION_FINDINGS.md`.
Line-order model confirmed by 3 independent signals (shared identities 1.65 vs 0.72
random; base aspects separated 1/21 on the line; common copy-gaps collapse to 1-3 packs).

**Scope:** Set 7+ (LAW, ASH) only, behind per-set behavior. Sets 1-6 byte-identical
behavior. No post-hoc pack mutation — stacking reorders whole packs (physical box
assembly), never touches pack contents.

---

## The four success criteria (user-specified, all must hold)

1. **Behavior changes** — the benchmark (Phase 0) shows the new generator's pool
   statistics moved, with the before/after report committed as proof.
2. **Existing tests and QA still pass** — `npm run test` (no new failures vs the
   2 known env/branch failures) and `npm run qa` 100% green, old sets unchanged.
3. **New tests and QA pass** — every new rule lands red→green with a spec test
   written FIRST; new QA suites added to `npm run qa`.
4. **Measurably better than the old algorithm** — the Phase 0 benchmark score
   (distance from real-data targets) improves on the pool-realism metrics and
   regresses on none of the already-matching metrics.

---

## Phase 0 — Benchmark harness BEFORE any generator change

New: `scripts/collation-benchmark.ts`. Runs N boxes through the generator and
scores against real-data targets using fixed definitions (deck cards only,
identity = name+subtitle treatment-invariant, pools = 4 consecutive 6-pack
windows in consumer order).

| Metric | Real-data target (today's evidence) | Current generator |
|---|---|---|
| M1 Normal+Normal pairs per pool | real pools: 0,0,3,7 (box 001); pool 002: 10 | **0.00 (impossible)** |
| M2 Dup identities per pool: mean | ~6.5 (13 real full pools: 4,4,4,5,5,5,4,14,13,6,4,10,13) | 5.8 |
| M3 Dup identities per pool: tail (% pools ≥10) | ~31% (4/13) | ~0.4% |
| M4 Box unique identities | 183 | 183.2 ± 2.6 ✅ keep |
| M5 Within-pack dup groups /pack (≥95% cross-variant) | 0.13 (4/30, all cross-variant) | 0.157 ✅ keep |
| M6 Base same-aspect adjacency, consumer order | ~random (5/21) | random post-A4 ✅ keep |
| M7 Leader repeat min gap, consumer order | 2 (Shin Hati box 001) | ~9 (impossible <6) |
| M8 Rare repeat min gap, consumer order | 2 | impossible <6 |
| M9 All slot rates (HS common/leader/base, UC3 outcomes, foil rarity, R:L) | per ASH_COLLATION_FINDINGS | ✅ keep |

Deliverable: run against CURRENT generator, commit the report
(`docs/collation-benchmark-baseline.md`). This is the "before" for criteria 1 & 4.

**Definition of "better" (criterion 4):** M1 > 0 with per-pool spread reaching ≥5;
M3 within 10–45%; M2 within 5.5–8.0; M4, M5, M6, M9 stay within their current
(already-real-matching) bands; M7/M8 minimums drop to ≤4. Any regression on
M4/M5/M6/M9 outside bands = fail, do not ship.

## Phase 1 — New spec tests, written RED

All numeric specs cite the real-data source in the assertion message. Statistical
tests are rate-based with generous bands (never hard `===0` over seeded samples —
lesson from the zero-rare-leader incident). Confirm each fails on current code.

**Line-level belt specs (new `src/belts/*.test.ts` cases):**
- L1 CommonBelt (Set 7+): each card appears exactly twice per boot; the two
  copies are 2–16 draws apart (mode ~4 ≈ 1 pack); aspect interleaving and
  segment quotas (≥1 Vig ≥1 Agg per A-segment, ≥1 Cmd ≥1 Cun per B-segment)
  still hold; lanes unchanged. (Source: box 001 line gaps 1×32, 3×17, 5×10.)
- L2 BaseBelt (Set 7+): line-order adjacent bases share an aspect ≤15% of
  adjacencies (line-level rule restored; box 001: 1/21), same-name adjacency
  still guarded. Sets 1-6 behavior unchanged (existing tests).
- L3 LeaderBelt (Set 7+): same-leader repeats possible at line gap 3 (observed),
  never gap 1; rate-based.
- L4 RareLegendaryBelt (Set 7+): same-rare repeats possible at line gap 4
  (observed), never gap 1; window param 6→4 for Set 7+ only.
- L5 HyperspaceUpgradeBelt: leader+base CAN co-occur in one plan (pool 002
  pack06 falsifies exclusivity; observed rate ≈ independence 1/36); budget cap
  2 and totals unchanged; rate over cycles ≈ 1-3 co-occurrences per 60.
- L6 Regression pins (must stay green THROUGHOUT): UC1/UC2 never HS (0 rate),
  HS common exactly 1/pack at slot 5, foil slot always HS-foil, ASH foil weights,
  Block B lane assignment rules.

**Stacking + consumer-level specs (new `src/utils/boosterPack` test cases):**
- S1 Stacking permutation is exactly: line k → box position `12-(k-1)/2` (k odd),
  `24-(k-2)/2` (k even); inverse matches Lee's 12,24,11,23,…,1,13; applied for
  Set 7+ sealed boxes/draft boxes only; pack CONTENTS untouched by stacking
  (same 24 packs, same cards, only order).
- S2 Sets 1-6 `generateSealedBox` output order unchanged.
- S3 Sealed pods (Set 7+): 4 pods of 6 cut from one stacked box consume
  consecutive box positions; pod stats inherit box stats.
- S4 Consumer-order pool distribution (statistical, 300+ boxes): Normal+Normal
  pairs per pool spread includes 0-pair pools AND ≥5-pair pools; % pools with
  ≥10 dup identities in 10–45%; mean dup identities 5.5–8.0.
- S5 Consumer-order box invariants: unique identities 183 ± 5; within-pack dup
  rate 0.10–0.20/pack, ≥90% cross-variant.

**New QA (added to `npm run qa`):** `src/qa/lineStacking.test.ts` — runs S4/S5
style distribution checks at QA sample sizes, rate-based assertions only.

## Phase 2 — Implementation slices (each: red test → code → green → full suite)

Ordered so each slice ships independently green:

1. **S1/S2/S3 stacking + pod cutting** (`boosterPack.ts`): pure permutation layer,
   no belt changes. Smallest risk; lands the architecture.
2. **L5 HS plan co-occurrence** (`HyperspaceUpgradeBelt`): delete the exclusivity
   check; budgets/totals unchanged.
3. **L2 BaseBelt line rule** (`BaseBelt`): Set 7+ conflict predicate becomes
   aspect-overlap OR same-name (restores pre-A4 aspect rule + keeps name guard).
   A4's consumer-facing randomness now comes from stacking (M6 verifies).
4. **L3/L4 leader & rare spacing** (leaderSheet param + RareLegendaryBelt window,
   per-set).
5. **L1 CommonBelt paired-copies boot** — the big one, LAST. Boot = every lane
   card exactly twice, second copy placed 2–16 draws after the first (distribution
   fit to box 001), subject to existing aspect interleaving + segment quotas via
   the existing backtracking placement; seam dedup unchanged. Fallback if
   constraint satisfaction proves infeasible at boot build: relax the copy-gap
   distribution before EVER relaxing aspect/quota rules, and log placement
   failures loudly (no silent short boots — lesson from the repair fix).

**Explicitly out of scope:** any cross-belt awareness, any post-hoc pack editing,
any change to sets 1-6, prestige/showcase rates, cross-treatment anti-collision
(refuted), eval-fixture formats.

## Phase 3 — Gates (all four criteria, in order)

1. `npm run test` — zero new failures.
2. `npm run qa` — 100% green including new lineStacking suite.
3. `scripts/collation-benchmark.ts` — produce `docs/collation-benchmark-after.md`;
   every "Definition of better" condition met; commit before+after reports together.
4. `npm run build`.
5. E2E sanity: one sealed + one draft happy path (`npm run test:e2e -- --grep "Sealed Happy Path"`).

Ship = commit slices on the working branch as they go green, but merge/deploy only
after gate 3 passes in full. Release note: player-facing one-liner.

## Phase 4 — Recalibration with the 6 boxes (next week)

Architecture frozen; parameters re-fit: common copy-gap distribution, leader/rare
spacing, HS leader/base rates (ran hot 2/6 in pool 002), foil C72/U13 question,
prestige 1/12, stacking-pattern verification per box (any contradiction → change
ONLY the permutation function). Then bake final distributions into QA as
regression guards and move findings to `/docs/`.

## Risks

- **CommonBelt boot feasibility** (paired copies × aspect interleave × quotas):
  mitigated by fallback ordering above + loud failure + slice isolation.
- **Seeded-QA sensitivity:** every new assertion is rate-based with bands.
- **Pods that don't come from box cuts today** (chaos sealed, pack wars/blitz
  single packs): keep line-order single-pack behavior; only sealed boxes/pods and
  draft boxes stack.
- **One-box calibration:** bands are wide on purpose; Phase 4 tightens.
