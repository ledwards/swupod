# Plan: Hyperspace Upgrade Belt — "Less Than Random" Collation

## Context

### The Problem

Currently, each HS slot upgrade is an **independent coin flip** (`Math.random() < probability`). This creates wide variance:

| Metric | Current (observed) | Target |
|--------|-------------------|--------|
| Mean HS/pack | ~1.15-1.24 | ~0.85 |
| σ (HS/pack) | ~0.97 | ~0.70 |
| Z-score for 2 HS | ~0.85 | 1.0-2.0 |
| Z-score for 3 HS | ~1.9 | ≥ 3.0 |
| Packs with ≥1 HS | ~72% | ~67% (~2/3) |

### Why Independent Trials Can't Work

With 7 upgrade slots each doing independent Bernoulli trials summing to μ ≈ 1.15, the variance is σ² = Σ pᵢ(1-pᵢ) ≈ 0.92 → σ ≈ 0.96. This is a mathematical floor for independent trials.

### How Real TCGs Solve This

Real TCG manufacturers use **print sheet collation**, not independent probability:
- Cards are printed on physical sheets in a predetermined layout
- Premium card positions on the sheet are fixed
- Packs are cut sequentially from sheets, giving controlled distribution
- Multiple sheets (A/B, C1/C2) prevent clustering
- Result: variance is **much tighter** than pure probability would predict
- Star Wars Unlimited recently moved to **guaranteed minimums** for HS in Set 7+

Our existing belt system (LeaderBelt, BaseBelt, RareLegendaryBelt) already models this for card selection. We need to extend the belt concept to **upgrade decisions**.

---

## Mathematical Analysis: What's Achievable

### Hard Constraint: P(0) = 1/3

The user requirement is that **exactly 1/3 of packs have zero HS cards** (i.e., 2/3 have ≥1 HS). With support {0, 1, 2} (strict max 2 HS per pack), we have:

- P(0) = 1/3 (fixed)
- P(1) + P(2) = 2/3
- μ = P(1) + 2·P(2)
- σ² = P(1) + 4·P(2) - μ²

Substituting P(1) = 2/3 - P(2):

- μ = 2/3 - P(2) + 2·P(2) = 2/3 + P(2)
- σ² = (2/3 - P(2)) + 4·P(2) - (2/3 + P(2))² = -μ² + 3μ - 4/3

### Z(3) ≥ 3.0 Constraint

Z(3) = (3 - μ) / σ ≥ 3.0

Squaring: (3 - μ)² ≥ 9σ² = 9(-μ² + 3μ - 4/3) = -9μ² + 27μ - 12

Expanding: 9 - 6μ + μ² ≥ -9μ² + 27μ - 12

Rearranging: 10μ² - 33μ + 21 ≥ 0

Solving the quadratic: μ ≤ 0.861 or μ ≥ 2.44 (only the lower root is physical)

**Result: μ ≤ 0.861 is required to achieve Z(3) ≥ 3.0 with P(0) = 1/3.**

### Working Distribution (μ = 0.833) — FINAL TUNED VALUES

With cycle size 60:

| Budget | Count | Fraction | Cumulative upgrades |
|--------|-------|----------|-------------------|
| 0 | 20 | 33.3% | 0 |
| 1 | 30 | 50.0% | 30 |
| 2 | 10 | 16.7% | 20 |
| **Total** | **60** | | **50 upgrades** |

- μ = 50/60 = **0.833**
- σ² = -0.833² + 3(0.833) - 4/3 = **0.473**
- σ = **0.687**
- Z(2) = (2 - 0.833) / 0.687 = **1.70** ✓ (target: 1.0-2.0)
- Z(3) = (3 - 0.833) / 0.687 = **3.16** ✓ (target: ≥ 3.0)
- P(≥1 HS) = 40/60 = **66.7%** ✓ (target: ~2/3)

Note: μ set to 0.833 (below theoretical max of 0.861) to provide margin for
real variance from independent variant-belt draws, which add noise.

### Slot Distribution Within the Cycle

46 total upgrades distributed across 60 packs:

| Slot | Count per 60 | Effective Rate | Target Rate |
|------|-------------|----------------|-------------|
| Leader HS | 10 | 1/6 | 1/6 |
| Base HS | 10 | 1/6 | 1/6 |
| Common HS | 12 | 1/5 | ~1/5 |
| UC3 → HS R/L | 8 | ~1/7.5 | ~1/8 |
| UC1 HS | 4 | ~1/15 | ~1/15 |
| UC2 HS | 2 | ~1/30 | ~1/30 |
| **Total** | **46** | | |

**NOTE:** The rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.

### Final Rate Adjustments (Sets 1-6)

| Slot | Old Rate (coin flip) | New Rate (belt) | Change |
|------|---------------------|-----------------|--------|
| Leader HS | 1/6 | 10/60 = 1/6 | unchanged |
| Base HS | 1/6 | 10/60 = 1/6 | unchanged |
| Common HS | 1/3 | 12/60 = 1/5 | reduce |
| UC1 HS | 1/8-1/8.5 | 4/60 = 1/15 | reduce |
| UC2 HS | 1/8-1/8.5 | 2/60 = 1/30 | reduce |
| UC3 → HS R/L | 1/5-1/5.5 | 8/60 = 1/7.5 | reduce |
| **Total μ** | **~1.15** | **~0.767** | |

---

## Proposed Architecture: HyperspaceUpgradeBelt

### Concept: "Budget Belt"

Instead of independent coin flips per slot, a **budget belt** pre-determines how many HS upgrades each pack receives, then distributes those upgrades across slots.

```
┌─────────────────────────────────────────────┐
│  HyperspaceUpgradeBelt (per-set, cached)    │
│                                              │
│  Hopper: [plan₁, plan₂, plan₃, ...]        │
│                                              │
│  Each plan = { budget: 0|1|2, slots: [...] } │
│  e.g. { budget: 1, slots: ['common'] }      │
│  e.g. { budget: 2, slots: ['leader','uc1'] } │
│  e.g. { budget: 0, slots: [] }              │
└─────────────────────────────────────────────┘
```

### How It Works

1. **Build a cycle** of 60 upgrade plans:
   - 20 plans with budget 0 (33.3% — the "1/3 with no HS" requirement)
   - 30 plans with budget 1 (50.0%)
   - 10 plans with budget 2 (16.7%)
   - Total upgrades: 0×20 + 1×30 + 2×10 = 50 → μ = 50/60 = 0.833

2. **Distribute slot assignments** across plans:
   - 10 leader upgrades across 60 plans (1/6)
   - 10 base upgrades (1/6)
   - 12 common upgrades (1/5)
   - 4 UC1 upgrades (1/15)
   - 2 UC2 upgrades (1/30)
   - 8 UC3 upgrades (~1/7.5)
   - 4 R/L upgrades (1/15)
   - Total: 50 ✓

3. **Constraint: leader + base never in same plan** (prevents co-occurrence)

4. **Shuffle** the plans (like belt segments), with seam dedup to prevent adjacent similar plans

5. **Pack generation calls `belt.next()`** instead of `shouldUpgrade()` for each slot

### Implementation Details

#### New File: `src/belts/HyperspaceUpgradeBelt.ts`

```typescript
interface UpgradePlan {
  leader: boolean
  base: boolean
  common: boolean
  uc1: boolean
  uc2: boolean
  uc3: boolean
  rare: boolean
}

class HyperspaceUpgradeBelt {
  hopper: UpgradePlan[]
  cycleSize: number  // 60

  _fill(): void {
    // 1. Create empty plans array (60 entries)
    // 2. Assign budget (0/1/2) to each plan:
    //    - First 20 get budget 0
    //    - Next 29 get budget 1
    //    - Last 11 get budget 2
    // 3. For each slot type, distribute N upgrades across plans
    //    (respecting budget limits and co-occurrence constraints)
    // 4. Shuffle plans
    // 5. Push to hopper
  }

  next(): UpgradePlan {
    this._fillIfNeeded()
    return this.hopper.shift()
  }
}
```

#### Modified: `src/utils/boosterPack.ts`

Replace independent `shouldUpgrade()` calls with belt lookups:

```typescript
// Before (independent coin flips):
if (probs.leaderToHyperspace && shouldUpgrade(probs.leaderToHyperspace)) { ... }
if (probs.baseToHyperspace && shouldUpgrade(probs.baseToHyperspace)) { ... }
// etc.

// After (belt-driven):
const upgradePlan = getHyperspaceUpgradeBelt(setCode).next()
if (upgradePlan.leader) { /* upgrade leader to HS */ }
if (upgradePlan.base) { /* upgrade base to HS */ }
// etc.
```

Non-HS upgrades (Showcase leader, Hyperfoil, Prestige) remain as independent coin flips since they're too rare to affect variance.

#### Modified: `src/utils/packConstants.ts`

Add belt configuration constants:

```typescript
export interface HSBeltConfig {
  cycleSize: number
  budgetDistribution: { 0: number, 1: number, 2: number }  // counts per cycle
  slotCounts: {
    leader: number
    base: number
    common: number
    uc1: number
    uc2: number
    uc3: number
    rare: number
  }
}
```

### Cache Integration

Follow existing belt pattern in `boosterPack.ts`:

```typescript
function getHyperspaceUpgradeBelt(setCode: SetCode | string): HyperspaceUpgradeBelt {
  const key = `hs-upgrade-${setCode}`
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceUpgradeBelt(setCode))
  }
  return beltCache.get(key)
}
```

Belt is cleared with `clearBeltCache()` for sealed pods (same as other belts).

---

## Files to Modify

| File | Change |
|------|--------|
| `src/belts/HyperspaceUpgradeBelt.ts` | **NEW** — Belt implementation |
| `src/utils/boosterPack.ts` | Replace `shouldUpgrade()` HS calls with belt lookups |
| `src/utils/packConstants.ts` | Add HS belt config constants, adjust per-slot rates |
| `src/utils/setConfigs/*.ts` | Update upgrade probability comments |
| `src/belts/HyperspaceUpgradeBelt.test.ts` | **NEW** — Unit tests for belt |
| `src/qa/hyperspaceDistribution.test.ts` | Already written — the target QA tests |

---

## Verification

1. **Unit test** (`HyperspaceUpgradeBelt.test.ts`):
   - Belt dispenses correct per-slot rates over 1000+ draws
   - No plan has budget > 2
   - Leader + base never co-occur in same plan
   - Budget distribution matches config (20/29/11)

2. **QA test** (`hyperspaceDistribution.test.ts` — already exists):
   - ≥1 HS rate ≈ 2/3 (55-80%)
   - Z(2 HS) between 1-2σ
   - Z(3 HS) ≥ 3σ
   - Leader+base co-occurrence < 5%
   - Per-slot rates within tolerance

3. **Existing QA** (`packGeneration.test.ts`):
   - Run full QA suite to verify no regressions in pack structure

---

## Red-Green TDD Procedure

### Phase 1: RED — Write Failing Tests

**Step 1a: Unit tests** (`src/belts/HyperspaceUpgradeBelt.test.ts`)

Write tests that exercise the belt in isolation (no pack generation, no card cache):

| Test | What it asserts |
|------|----------------|
| Budget distribution matches config | Over 600 draws (10 cycles), exactly 1/3 have budget 0, budget 1 and 2 match config |
| Max budget is 2 | No plan ever has more than 2 slots set to true |
| Leader + base never co-occur | No plan has both `leader: true` and `base: true` |
| Per-slot rates match config | Over 600 draws, leader rate ≈ 1/6, base rate ≈ 1/6, R/L rate ≈ 1/15 (within 20% tolerance) |
| Total upgrades per cycle | Sum of all true slots across 60 consecutive plans = 51 |
| Hopper refills automatically | Drawing 120 plans (2 cycles) succeeds without error |
| Plans are shuffled | Two consecutive cycles don't produce identical sequences |

**Step 1b: QA tests** (`src/qa/hyperspaceDistribution.test.ts` — already exist)

These already test the full pipeline. Currently failing on:
- Z(2 HS) between 1-2σ (currently ~0.85)
- Z(3 HS) ≥ 3σ (currently ~1.9)

### Phase 2: GREEN — Implement and Pass

**Step 2a:** Implement `HyperspaceUpgradeBelt` class → unit tests pass

**Step 2b:** Add `HSBeltConfig` to `packConstants.ts`

**Step 2c:** Integrate belt into `boosterPack.ts` (replace `shouldUpgrade()` HS calls) → QA tests pass

**Step 2d:** If QA tests still fail, tune rates in `HSBeltConfig` and re-run. Iterate until all pass.

### Phase 3: Regression Check

Run existing test suites to verify no regressions:
- `npm run test` (all 204 unit tests)
- `npm run qa` (full statistical QA)

---

## Open Questions for Tuning

1. **Exact rate adjustments**: The common HS (1/3→1/5) and UC HS reductions are estimates. Final values should be tuned through QA iteration to hit the sigma targets. The total must sum to ~51 per 60-pack cycle.

2. **Cycle size**: 60 allows integer allocation for leader (10) and base (10) at 1/6, and R/L (4) at 1/15. Could use 120 for finer granularity on UC slots.

3. **LAW+ handling**: Set 7+ has guaranteed HS common. The belt for LAW should account for this (budget starts at 1 minimum, or the guaranteed common is handled separately outside the belt).
