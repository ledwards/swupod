---
paths:
  - "src/belts/**"
  - "src/utils/boosterPack*"
  - "src/utils/carboniteBoosterPack*"
  - "src/utils/carboniteConstants*"
  - "src/utils/packConstants*"
---

# Belt System Rules

## Physical Printer Metaphor
The belt system mimics a **real-life card printing press**. Cards come off belts in sequence.

- **NEVER** add post-hoc passes that examine the pack and modify it (dedup passes, reordering, slot-aware fixups)
- **NEVER** add logic where one belt checks what another belt produced. Belts are independent physical systems.
- Cross-belt duplicates are realistic and acceptable. Only same-belt duplicates indicate a bug.
- **NEVER exclude cards from a boot** — every card appears exactly once per cycle. Dedup by PLACEMENT, not exclusion.

## Belt Types
- **LeaderBelt**: 1 leader per pack, alternates common/rare with seam deduplication
- **BaseBelt**: 1 common base per pack, aspect-based deduplication
- **CommonBelt**: 9 commons, uses A/B pools for deduplication
- **UncommonBelt**: 3 uncommons
- **RareLegendaryBelt**: 1 rare or legendary
- **FoilBelt**: 1 foil of any rarity
- **ShowcaseLeaderBelt**: Very rare showcase leaders (~1 in 288 packs)
- **HyperspaceUpgradeBelt**: Controls HS upgrade distribution per pack (budget belt, not coin flips). Pre-determines which slots get HS upgrades in cycles of 60 packs. ~2/3 of packs get at least 1 HS, max 2.
- **Hyperspace belts**: Various hyperspace variants (card selection after upgrade decision)

## Carbonite Belts (premium packs where every card is a variant)
- **CarboniteSlotBelt**: Configurable belt for rarity-locked carbonite slots
- **CarboniteFoilRLBelt**: Weighted R/L Foil slot (70% Rare / 20% Special / 10% Legendary)
- **CarbonitePrestigeBelt**: Prestige card slot (synthesized from R/L pool)
- **HyperfoilBelt**: Hyperspace Foil cards (used in both standard and carbonite packs)

## Key Constraints
- **24-position dedup window**: min(24, floor(beltSize/2)) positions, including across seam boundaries
- **Primary aspect interleaving**: No adjacent cards share the same primary aspect (aspects[0])
- **Equal occurrence rate**: Every card appears exactly once per boot

## Rare Slot Rule
- The R/L slot (index 14) is NEVER upgraded to Hyperspace variant
- Hyperspace rares/legendaries ONLY appear via UC3 upgrade (slot 3 uncommon -> random HS R/L from belt)
- The `HyperspaceUpgradeBelt` has no `rare` slot — only: leader, base, common, uc1, uc2, uc3

## Pack Structures
- **Standard**: Orchestrated by `boosterPack.ts`, 16-card packs
- **Carbonite Pre-LAW**: [0] Leader HS, [1-4] Common Foil x4, [5-6] UC Foil x2, [7] R/L Foil, [8] Prestige, [9-11] Common HS x3, [12] UC HS, [13] R/L HS, [14-15] HSF x2
- **Carbonite LAW+**: Tiered slot architecture — see `carboniteConstants.ts`

## ALWAYS Run Full QA After Any Change
After ANY change to belts, boosterPack.ts, upgrade logic, or pack structure:
```bash
npm run test && npm run qa
```
NEVER commit pack generation changes without seeing all QA and unit tests pass.
