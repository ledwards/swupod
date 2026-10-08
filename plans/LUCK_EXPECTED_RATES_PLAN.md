# Plan: Set-Specific Expected Pull Rates (Luck)

**Goal:** make the "expected" baseline in the Luck tab precise and per-set, accounting
for how packs actually work — base slots, the hyperspace (HS) upgrade budget,
foil slots, UC3→HS upgrades, and prestige in the sets that have it. Today's
expected model (`src/services/expectedDistribution.ts`) only covers the **base
belt** path and explicitly defers everything variant-related to "v2". This plan
is v2.

## Why the current model is wrong for variants

`expectedDistribution.ts` (read its header) computes per-card expected as
`(slot count × rarity share) / pool size`, over **Normal** base-belt cards only.
It drops HS, HS-foil, foil, showcase, prestige because those belts are
**60-pack-budgeted**, not independent per-slot draws. So:

- A card's true expected count includes the chance it shows up as a foil, an HS,
  or an HS-foil — none of which the current model counts.
- Duplicate and showcase expectations are therefore understated, which is why
  observed (cross-treatment) dwarfs expected.

## Source of truth (already in the repo)

- `src/utils/packConstants.ts` — `PACK_STRUCTURE`, `SETS_1_3_CONSTANTS`,
  `SETS_4_6_CONSTANTS`, `SET_7_PLUS_CONSTANTS` (slot counts, HS budgets, rates).
- `src/utils/setConfigs/*.ts` — per-set `upgradeProbabilities`
  (`leaderToShowcase`, `leaderToHyperspace`, `baseToHyperspace`,
  `foilToHyperfoil`, `firstUCToHyperspaceUC`, `secondUCToHyperspaceUC`,
  `thirdUCToHyperspaceRL`, `commonToHyperspace`, `rareToPrestige`,
  `uc3ToPrestige`), `beltRatios.rareToLegendary`, `cardCounts`, `packRules`.
- `src/belts/` — the belts that actually realize these (HyperspaceUpgradeBelt is
  the 60-pack budget; CommonUpgradeBelt is the 48-pack LAW+ cycle; FoilBelt,
  ShowcaseLeaderBelt, CarbonitePrestigeBelt).

## The model to build

For each set, compute **per-card expected copies per pack, summed over every way
that card can appear**:

```
E[card C per pack] =
    P(C in a base common/uncommon/rare/legendary slot)      // existing v1 logic
  + P(C as the foil-slot card)                               // 1 foil slot, any rarity
  + P(C as an HS upgrade)        × P(C | HS occurs)          // HS budget ~2/3 packs, set-specific
  + P(C as an HS-foil)                                       // foil slot upgraded
  + P(C as a UC3→HS R/L upgrade) (LAW+: outcome belt)        // thirdUCToHyperspaceRL
  + P(C as a prestige)           (carbonite sets only)       // rareToPrestige / uc3ToPrestige
  + P(C as a showcase leader)    (leaders only)              // leaderToShowcase
```

Each term = `slot_probability × (1 / pool_size_for_that_rarity_and_treatment)`.
The HS pool, foil pool, showcase pool, and prestige pool are **distinct card
lists** (different collector-number ranges — e.g. LAW HS leaders are LAW-265+),
so pool sizes come from filtering `getCardsBySet` by `variantType`/flags, not the
base pool.

### Steps

1. **Spec extraction (spec-first, per `.claude/rules/testing.md`).** For each set,
   write down the slot odds from `packConstants` + `setConfigs` as hardcoded
   constants in the test, NOT derived from the card pool. e.g. "LAW foil slot =
   1/pack; LAW HS budget = 40/60 packs; LAW showcase leader = 1/576."
2. **Extend `ExpectedPerPack`** with treatment-aware per-card expectations:
   keep `cards` (base) and add `cardsAllTreatments: Map<cardId, number>` that sums
   the terms above. Key by **collector id of the base card** so variants fold onto
   one identity (matches how observed pulls are collapsed in the luck route).
3. **HS budget distribution.** The HS budget is per-slot-type within a 60-pack
   cycle (see `HyperspaceUpgradeBelt`). Convert the budget to a per-pack
   probability per slot, then split across the HS pool for that slot's rarity.
4. **Foil slot.** 1 guaranteed foil/pack, rarity-weighted; in LAW+ the foil is
   always HS-foil. Expected foil copies of card C = foil_rarity_share(C.rarity) /
   foil_pool_size(C.rarity).
5. **Showcase / prestige** as independent low-probability terms on the relevant
   pools.
6. **Validation harness.** Generate 10k packs with the real belt system
   (`src/utils/boosterPack.ts`) and assert the empirical per-card / per-treatment
   rates match the analytic model within tolerance. This is the proof the numbers
   are right (mirrors `npm run qa`).
7. **Wire into the luck route.** Use `cardsAllTreatments` for the histogram's
   expected, the duplicate expectation, and the showcase widget. Keep base-only
   for any view that should exclude variants.

### Per-set scope notes

- Sets 1–6: 9 base commons, 3 UCs, 1 R/L, 1 foil; HS via `commonToHyperspace` +
  UC upgrades; `foilToHyperfoil`. No prestige.
- LAW/ASH (Set 7+): slot 5 is a **dedicated** HS common; foil is always HS-foil;
  UC3 outcome belt; `guaranteedHyperspaceCommon`.
- Carbonite (`-CB`) sets: prestige via `rareToPrestige`/`uc3ToPrestige` — model
  separately; these carry their own set code so they're already excluded from
  normal-pack stats.

### Deliverables

- `cardsAllTreatments` in `expectedDistribution.ts` + tests with hardcoded spec
  odds and a 10k-pack empirical cross-check.
- Luck route uses it for histogram expected, duplicates, showcase.
- A short `docs/` note documenting each set's slot odds table.

### Risk / size

Medium-large. The math is well-defined but per-set and easy to get subtly wrong;
the empirical cross-check is the safeguard. Estimate 1–2 focused sessions.
