# Carbonite Booster Pack Implementation

## Status: Complete

## Overview

Carbonite Booster Packs are a premium pack type for Sets 4-7 (JTL, LOF, SEC, LAW) where every card is a variant (foil, hyperspace, prestige, or showcase). The pack structure differs between pre-LAW and LAW+ sets because LAW eliminated traditional foils.

Carbonite packs are selectable in Chaos Sealed, Chaos Draft, and other special formats. They are NOT available in normal draft or sealed.

## Pack Structure

### Pre-LAW Carbonite (JTL, LOF, SEC) — 16 cards

| Slot | Type | Belt |
|------|------|------|
| [0] | Leader — always Hyperspace (showcase upgrade ~1/20) | LeaderBelt |
| [1-4] | Common Foil x 4 | CarboniteSlotBelt (Common, Normal source, foil output) |
| [5-6] | Uncommon Foil x 2 | CarboniteSlotBelt (Uncommon, Normal source, foil output) |
| [7] | R/L Foil x 1 (weighted 70/20/10) | CarboniteFoilRLBelt |
| [8] | Prestige x 1 (tier1/tier2/serialized) | CarbonitePrestigeBelt |
| [9-11] | Common Hyperspace x 3 | CarboniteSlotBelt (Common, HS source, HS output) |
| [12] | Uncommon Hyperspace x 1 | CarboniteSlotBelt (Uncommon, HS source, HS output) |
| [13] | R/L Hyperspace x 1 (weighted 70/20/10) | CarboniteSlotBelt (R/S/L, HS source, HS output) |
| [14-15] | Hyperspace Foil x 2 | HyperfoilBelt |

### LAW+ Carbonite (LAW) — 16 cards

| Slot | Type | Belt |
|------|------|------|
| [0] | Leader — always Hyperspace (showcase upgrade ~1/48) | LeaderBelt |
| [1] | Prestige x 1 | CarbonitePrestigeBelt |
| [2-9] | Hyperspace non-foil x 8 (weighted rarity) | CarboniteSlotBelt (all rarities, weighted) |
| [10-15] | Hyperspace Foil x 6 | HyperfoilBelt |

## Architecture

### Composite Set Codes

Carbonite packs use `{SET}-CB` format (e.g., `JTL-CB`, `LAW-CB`):
- `generateBoosterPack()` detects `-CB` suffix and delegates to `generateCarboniteBoosterPack()`
- `getBaseSetCode('JTL-CB')` returns `'JTL'` for config/card pool access
- `getPackImageUrl('JTL-CB')` returns Carbonite-specific pack art
- PackSelector shows Carbonite entries in a separate row below standard packs

### Belt System

All belts use the standard hopper/filling pool pattern:

- **CarboniteSlotBelt** — Configurable belt for rarity-specific slots. Takes a config object specifying:
  - `rarities`: which rarities to include
  - `sourceVariant`: which variant type to pull from (`'Normal'` for foils, `'Hyperspace'` for HS)
  - `outputFlags`: flags to stamp on output cards (e.g., `{ isFoil: true }`)
  - `weights`: optional rarity weights for multi-rarity belts (R/L slots)

- **CarboniteFoilRLBelt** — R/L-only foil belt with weighted distribution (70% Rare, 20% Special, 10% Legendary)

- **CarbonitePrestigeBelt** — Synthesizes Prestige variants from Normal R/L cards. Rolls a prestige tier:
  - `tier1`: 80% — most common
  - `tier2`: 18% — foil visual treatment
  - `serialized`: 2% — serialized/250, foil visual treatment

### Visibility

Carbonite sets are filtered by the `includeCarbonite` flag on `fetchSets()`:
- Default `false` — normal draft/sealed never see Carbonite packs
- Chaos sealed, chaos draft, and other special format pages pass `includeCarbonite: true`
- Follows the same pattern as `includeBeta` for beta sets

## Files

### New Files
| File | Purpose |
|------|---------|
| `src/utils/carboniteConstants.ts` | Carbonite-specific parameters (supported sets, rates, weights, slot counts) |
| `src/utils/carboniteBoosterPack.ts` | Pack generation orchestrator |
| `src/belts/CarboniteSlotBelt.ts` | Configurable rarity-specific belt |
| `src/belts/CarboniteFoilRLBelt.ts` | R/L-only foil belt |
| `src/belts/CarbonitePrestigeBelt.ts` | Prestige variant synthesis belt |
| `src/utils/packSelectorSort.ts` | Extracted sorting logic for PackSelector |
| Test files | `carboniteBoosterPack.test.ts`, `CarboniteSlotBelt.test.ts`, `CarboniteFoilRLBelt.test.ts`, `CarbonitePrestigeBelt.test.ts` |

### Modified Files
| File | Change |
|------|--------|
| `src/utils/boosterPack.ts` | `-CB` detection, `clearCarboniteBeltCache()`, prestige in LAW standard packs |
| `src/utils/packArt.ts` | Pack image variants system, Carbonite pack images, cycling/random selection functions |
| `src/utils/api.ts` | `includeCarbonite` flag, Carbonite set entries |
| `src/components/PackSelector.tsx` | Carbonite row display, packSelectorSort integration |
| `app/api/formats/chaos-sealed/route.ts` | Variable pack count (1-12), Carbonite validation |
| `app/formats/chaos-sealed/page.tsx` | Pack count selector (1-12), Carbonite support |
| `app/formats/chaos-draft/page.tsx` | Pack count, localStorage persistence |

## Constants

```typescript
CARBONITE_CONSTANTS = {
  supportedSets: ['JTL', 'LOF', 'SEC', 'LAW'],
  showcaseRate: { preLaw: 1/20, law: 1/48 },
  prestigeTierWeights: { tier1: 80, tier2: 18, serialized: 2 },
  foilRLWeights: { Rare: 70, Special: 20, Legendary: 10 },
  hsRLWeights: { Rare: 70, Special: 20, Legendary: 10 },
  hsNonFoilWeights: { Common: 85, Uncommon: 7, Rare: 4, Special: 3, Legendary: 1 },
  preLaw: { commonFoils: 4, uncommonFoils: 2, foilRL: 1, prestige: 1, commonHS: 3, uncommonHS: 1, rlHS: 1, hsFoil: 2 },
  law: { prestige: 1, hsNonFoil: 8, hsFoil: 6 },
}
```

## Testing

- 27 Carbonite-specific tests across 4 test files
- Pack structure tests verify exact slot contents (rarity, variant, flags)
- Statistical tests validate showcase rate, prestige tier distribution, R/L weights
- All supported sets (JTL, LOF, SEC, LAW) tested for 16-card output
- Composite code parsing verified
- Error handling for unsupported sets verified
