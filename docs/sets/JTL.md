# JTL - Jump to Lightspeed

> **LLM INSTRUCTION**: Keep this document up to date whenever JTL-related pack generation logic, belt assignments, rarity weights, or configurations change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | JTL |
| Set Number | 4 |
| Set Name | Jump to Lightspeed |
| Release Date | 2025-03-14 |
| Block | A |
| Color | `#00CED1` (Cyan) |

## Card Counts

| Category | Count |
|----------|-------|
| Total Cards | ~1130 (all variants) |
| Leaders (Common) | 8 |
| Leaders (Rare) | 10 |
| Leaders (Total) | 18 |
| Bases (Common) | 8 |
| Bases (Rare) | 0 |
| Bases (Total) | 8 |
| Commons | 100 |
| Uncommons | 60 |
| Rares | 50 |
| Legendaries | 20 |
| Specials | 8 |

## Pack Construction

### Standard Pack (16 cards)
1. **Leader** (1) - From LeaderBelt, alternating Common/Rare
2. **Base** (1) - Common from BaseBelt
3. **Commons** (9) - Slots 1-4 from Belt A, slot 5 alternates, slots 6-9 from Belt B
4. **Uncommons** (3) - From UncommonBelt
5. **Rare/Legendary** (1) - 5:1 ratio
6. **Foil** (1) - Any rarity including Special, can upgrade to Hyperspace Foil

### Belt Configuration (Block A)

| Belt | Aspects | Target Size | Slots |
|------|---------|-------------|-------|
| A | Vigilance, Command, Villainy | 50 | 1-4, alternating 5 |
| B | Aggression, Cunning, Heroism, Neutral | 50 | alternating 5, 6-9 |

### Hyperspace Slot
- Position: Slot 4 (1-indexed)
- Pack Index: 5 (after leader + base + 3 commons)

### Alternating Slot
- Slot 5 alternates between Belt A and Belt B across packs

## Upgrade Probabilities

| Upgrade | Rate | Notes |
|---------|------|-------|
| Leader → Hyperspace | 1/6 (~16.7%) | Belt-driven, ~4 per box |
| Leader → Showcase | 1/288 (~0.35%) | Independent coin flip |
| Base → Hyperspace | 1/6 (~16.7%) | Belt-driven, ~4 per box |
| Foil → Hyperfoil | 1/50 (2%) | Independent, ~1 per 2 boxes |
| Common → Hyperspace | 1/5 (20%) | Belt-driven, in slot 4 |
| UC Slot 3 → HS R/L | 1/7.5 (~13.3%) | Belt-driven, rarity upgrade |
| UC1 → Hyperspace UC | 1/15 (~6.7%) | Belt-driven |
| UC2 → Hyperspace UC | 1/30 (~3.3%) | Belt-driven |
| Rare → Hyperspace | 1/15 (~6.7%) | Belt-driven |

All HS upgrades use the HyperspaceUpgradeBelt (budget system, not independent coin flips).
~2/3 of packs have at least 1 HS card, max 2 per pack.

## Rarity Weights

### Foil Slot
| Rarity | Weight | Percentage |
|--------|--------|------------|
| Common | 65 | 65% |
| Uncommon | 20 | 20% |
| Rare | 8 | 8% |
| Special | 4 | 4% |
| Legendary | 3 | 3% |

### UC Slot 3 (When Upgraded)
| Rarity | Weight | Percentage |
|--------|--------|------------|
| Uncommon | 60 | 60% |
| Rare | 25 | 25% |
| Special | 10 | 10% |
| Legendary | 5 | 5% |

### Hyperspace Non-Foil
| Rarity | Weight | Percentage |
|--------|--------|------------|
| Common | 85 | 85% |
| Uncommon | 7 | 7% |
| Rare | 4 | 4% |
| Special | 3 | 3% |
| Legendary | 1 | 1% |

## Belt Assignments

### Belt A (50 cards)
See `src/belts/data/commonBeltAssignments.js` for full list.

Key aspects: Vigilance (Blue), Command (Green), Villainy

**Note**: Belt A switched from Aggression to Villainy starting in Block A.

### Belt B (50 cards)
See `src/belts/data/commonBeltAssignments.js` for full list.

Key aspects: Aggression (Red), Cunning (Yellow), Heroism, Neutral

## Special Rules

- **Special Rarity**: First set with Special rarity cards in packs
- **No Rare Bases**: All bases are Common
- **Space Combat Theme**: Focus on starfighters and capital ships
- **Balanced Belts**: Both belts have 50 cards (vs 60/30 in Block 0)

## Limited/Draft Play

> Note: These rankings are used by bot AI for drafting. Data sourced from Dexerto tier lists, GarbageRollers draft guides, swumetastats.com, and community consensus.

### Leader Rankings (Best to Worst)

| Rank | Leader | Aspects | Notes |
|------|--------|---------|-------|
| 1 | Poe Dameron | Aggression/Heroism | Top 8 appearances |
| 2 | Darth Vader | Command/Villainy | Powerhouse |
| 3 | Admiral Piett | Command/Villainy | Top 8 appearances |
| 4 | Han Solo | Cunning/Heroism | Cunning/heroism |
| 5 | Lando Calrissian | Vigilance/Heroism | Buying Time |
| 6 | Asajj Ventress | Vigilance/Villainy | Vigilance/villainy |
| 7 | Luke Skywalker | Aggression/Heroism | Aggression/heroism |
| 8 | Wedge Antilles | Command/Heroism | Command/heroism |
| 9 | Boba Fett | Aggression/Villainy | Aggression/villainy |
| 10 | Grand Admiral Thrawn | Vigilance/Villainy | Vigilance/villainy |
| 11 | Admiral Ackbar | Cunning/Heroism | Cunning/heroism |
| 12 | Admiral Holdo | Command/Heroism | Command/heroism |
| 13 | Captain Phasma | Aggression/Villainy | Aggression/villainy |
| 14 | Admiral Trench | Cunning/Villainy | Cunning/villainy |
| 15 | Major Vonreg | Aggression/Villainy | Aggression/villainy |
| 16 | Rose Tico | Vigilance/Heroism | Vigilance/heroism |
| 17 | Kazuda Xiono | Cunning/Heroism | Cunning/heroism |
| 18 | Rio Durant | Cunning/Villainy | Cunning/villainy |

### Powerful Cards

Cards that overperform in limited play (used by bot AI for drafting with +25 bonus):

- Coordinate

## Key Differences from Block 0

| Feature | Block 0 | Block A (JTL) |
|---------|---------|---------------|
| Belt A aspects | Vig, Cmd, Agg | Vig, Cmd, Vil |
| Belt sizes | 60/30 | 50/50 |
| Belt A slots | 1-6 | 1-4 + alt 5 |
| Belt B slots | 7-9 | alt 5 + 6-9 |
| HS slot | 6 | 4 |
| R:L ratio | 6:1 | 5:1 |
| Special in packs | No | Yes |

## Related Files

- `src/utils/setConfigs/JTL.js` - Set configuration
- `src/belts/data/commonBeltAssignments.js` - Belt A/B card lists
- `src/utils/packConstants.js` - `SETS_4_6_CONSTANTS`
