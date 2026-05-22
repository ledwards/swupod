# ASH - Ashes of the Empire

> **LLM INSTRUCTION**: Keep this document up to date whenever ASH-related pack generation logic, belt assignments, rarity weights, or configurations change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | ASH |
| Set Number | 8 |
| Set Name | Ashes of the Empire |
| Prerelease Date | 2026-07-10 |
| Release Date | 2026-07-17 |
| Block | B |
| Color | `#8B0000` (Dark Red / Empire) |
| Status | **Partially Spoiled (Beta)** |

ASH is the second Block B set after LAW. Pack rules and card counts are currently **inherited from LAW** as placeholders until FFG announces specifics and physical packs verify collation. Treat everything below as provisional — see [ASH_TBD.md](ASH_TBD.md) for the full list of unknowns.

## Visibility Gates

ASH does not appear in any set selector until BOTH conditions are met:

1. **Date gate** — `prereleaseDate` (2026-07-10) has been reached, OR caller passes `includeBeta: true`
2. **Card-count gate** — at least one real ASH card exists in [cards.json](../../src/data/cards.json)

Both gates apply independently. The card-count gate has no opt-out — a set with zero spoiled cards is never displayed, even with `includeBeta: true`. See [api.ts](../../src/utils/api.ts) `fetchSets()` and [cardData.ts](../../src/utils/cardData.ts) `hasCardsForSet()`.

## Card Counts (Placeholder — Copied from LAW)

> All counts below are placeholders inherited from LAW. Update once enough ASH cards are spoiled to estimate the set's actual distribution. See [ASH_TBD.md](ASH_TBD.md).

| Category | Placeholder Count |
|----------|-------------------|
| Leaders (Common) | 8 |
| Leaders (Rare) | 8 |
| Leaders (Total) | 18 |
| Bases (Common) | 8 |
| Bases (Rare) | 3 |
| Bases (Total) | 12 |
| Commons | 100 |
| Uncommons | 60 |
| Rares | 47 |
| Legendaries | 20 |
| Specials | 10 |

## Pack Construction (Inherited from LAW)

Until FFG announces changes, ASH packs use the LAW (Block B) structure:

- **Foil slot is always Hyperspace Foil** (no regular foils)
- **Dedicated HS common in slot 5** from `HyperspaceCommonBelt`
- **Prestige cards in standard packs** at ~1/18 in the UC3 slot
- **Showcase leaders ~1/576** (rarer than pre-LAW sets)
- **Triple-aspect cards** present but fewer than LAW
- Rare bases occupy the rare slot
- Belt A / Belt B split is 50 / 50 by aspect, same auto-assignment rules as LAW

For the full pack flow, slot order, and upgrade pass, see [LAW.md](LAW.md) — the implementation in [boosterPack.ts](../../src/utils/boosterPack.ts) routes both LAW and ASH through `usesLawPackRules()`.

## Belt Assignment

ASH currently shares LAW's Block B belt configuration in [commonBeltAssignments.ts](../../src/belts/data/commonBeltAssignments.ts). If physical ASH packs reveal a different aspect split, override here.

## Implementation Status

| Component | Status |
|-----------|--------|
| Set config | ✅ Scaffolded in [setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) |
| Expansion art | ✅ [public/expansion-art/ash.png](../../public/expansion-art/ash.png) |
| Pack art mapping | ✅ [packArt.ts](../../src/utils/packArt.ts) |
| Fetch-cards scraper | ✅ Added to SETS array in [fetchCards.ts](../../scripts/fetchCards.ts) |
| Belt auto-assignment | ✅ Block B (shared with LAW) |
| Set selector entry | ✅ [api.ts](../../src/utils/api.ts) `knownSets` (gated by beta + card-count) |
| Real card data | ⏳ 0 cards in [cards.json](../../src/data/cards.json) as of last `fetch-cards` run |
| Leader rankings | ⏳ Post-release |
| Powerful cards | ⏳ Post-release |

## Sources

To be added as FFG publishes them.

## Related Files

- [src/utils/setConfigs/ASH.ts](../../src/utils/setConfigs/ASH.ts) - Set configuration
- [src/utils/api.ts](../../src/utils/api.ts) - `knownSets` and visibility gates
- [src/utils/cardData.ts](../../src/utils/cardData.ts) - `hasCardsForSet()` card-count gate
- [src/utils/boosterPack.ts](../../src/utils/boosterPack.ts) - `usesLawPackRules()` routes ASH through LAW pack assembly
- [src/belts/data/commonBeltAssignments.ts](../../src/belts/data/commonBeltAssignments.ts) - Block B belt rules (shared with LAW)
- [LAW.md](LAW.md) - Block B reference doc (ASH inherits its rules)
- [ASH_TBD.md](ASH_TBD.md) - Unknowns and verification queue
