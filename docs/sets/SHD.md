# SHD - Shadows of the Galaxy

> **LLM INSTRUCTION**: Keep this document up to date whenever SHD-related pack generation logic, belt assignments, rarity weights, or configurations change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | SHD |
| Set Number | 2 |
| Set Name | Shadows of the Galaxy |
| Release Date | 2024-07-12 |
| Block | 0 |
| Color | `#4A0080` (Purple) |

## Card Counts

| Category | Count |
|----------|-------|
| Total Cards | ~1008 (all variants) |
| Leaders (Common) | 8 |
| Leaders (Rare) | 8 |
| Leaders (Total) | 16 |
| Bases (Common) | 8 |
| Bases (Rare) | 2 |
| Bases (Total) | 10 |
| Commons | 90 |
| Uncommons | 60 |
| Rares | 48 |
| Legendaries | 22 |
| Specials | 0 |

## Pack Construction

### Standard Pack (16 cards)
1. **Leader** (1) - From LeaderBelt, alternating Common/Rare
2. **Base** (1) - Common from BaseBelt
3. **Commons** (9) - Slots 1-6 from Belt A, slots 7-9 from Belt B
4. **Uncommons** (3) - From UncommonBelt
5. **Rare/Legendary** (1) - 7:1 ratio, 1 in 8 legendary (includes rare bases)
6. **Foil** (1) - Any rarity, can upgrade to Hyperspace Foil

### Belt Configuration (Block 0)

| Belt | Aspects | Target Size | Slots |
|------|---------|-------------|-------|
| A | Vigilance, Command, Aggression | 60 | 1-6 |
| B | Cunning, Villainy, Heroism, Neutral | 30 | 7-9 |

### Hyperspace Slot
- Position: Slot 6 (1-indexed)
- Pack Index: 7 (after leader + base + 5 commons)

## Upgrade Probabilities

| Upgrade | Rate | Notes |
|---------|------|-------|
| Leader → Hyperspace | 1/6 (~16.7%) | Belt-driven, ~4 per box |
| Leader → Showcase | 1/288 (~0.35%) | Independent coin flip |
| Base → Hyperspace | 1/6 (~16.7%) | Belt-driven, ~4 per box |
| Foil → Hyperfoil | 1/50 (2%) | Independent, ~1 per 2 boxes |
| Common → Hyperspace | 1/5 (20%) | Belt-driven, in slot 6 |
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
| Common | 70 | 70% |
| Uncommon | 20 | 20% |
| Rare | 8 | 8% |
| Legendary | 2 | 2% |
| Special | 0 | 0% |

### UC Slot 3 (When Upgraded)
| Rarity | Weight | Percentage |
|--------|--------|------------|
| Uncommon | 64 | 64% |
| Rare | 31 | 31% |
| Legendary | 5 | 5% |

### Hyperspace Non-Foil
| Rarity | Weight | Percentage |
|--------|--------|------------|
| Common | 90 | 90% |
| Uncommon | 6 | 6% |
| Rare | 3 | 3% |
| Legendary | 1 | 1% |

## Belt Assignments

### Belt A (60 cards)
See `src/belts/data/commonBeltAssignments.js` for full list.

Key aspects: Vigilance (Blue), Command (Green), Aggression (Red)

### Belt B (30 cards)
See `src/belts/data/commonBeltAssignments.js` for full list.

Key aspects: Cunning (Yellow), Villainy, Heroism, Neutral

## Special Rules

- **No Special Rarity**: SHD has no Special rarity cards
- **Rare Bases**: 2 rare bases appear in the Rare slot
- **Bounty Hunter Theme**: Focus on Mandalorian and bounty hunter characters

## Limited/Draft Play

> Note: These rankings are used by bot AI for drafting. Data sourced from Dexerto tier lists, GarbageRollers draft guides, swumetastats.com, and community consensus.

### Leader Rankings (Best to Worst)

| Rank | Leader | Aspects | Notes |
|------|--------|---------|-------|
| 1 | Han Solo | Aggression/Heroism | 55.2% win rate |
| 2 | Cad Bane | Cunning/Villainy | Excels in limited, Underworld synergy |
| 3 | Qi'ra | Vigilance/Villainy | Strong all-around |
| 4 | Boba Fett | Command/Heroism | Strong in limited |
| 5 | Bossk | Cunning/Villainy | Bounties mechanic, strong limited |
| 6 | Gar Saxon | Vigilance/Villainy | Vigilance/villainy |
| 7 | Rey | Vigilance/Heroism | Vigilance/heroism |
| 8 | Kylo Ren | Aggression/Villainy | Aggression/villainy |
| 9 | Bo-Katan Kryze | Aggression/Heroism | Aggression/heroism |
| 10 | Fennec Shand | Cunning/Heroism | Cunning/heroism |
| 11 | Jabba the Hutt | Command/Villainy | Command/villainy |
| 12 | Finn | Vigilance/Heroism | Vigilance/heroism |
| 13 | Hondo Ohnaka | Command/Villainy | Command/villainy |
| 14 | Doctor Aphra | Cunning/Villainy | Cunning/villainy |
| 15 | Lando Calrissian | Cunning/Heroism | Cunning/heroism |
| 16 | Hunter | Command/Heroism | Command/heroism |

### Powerful Cards

Cards that overperform in limited play (used by bot AI for drafting with +25 bonus):

- Viper Probe Droid
- Cantina Bouncer
- Coordinate

## Related Files

- `src/utils/setConfigs/SHD.js` - Set configuration
- `src/belts/data/commonBeltAssignments.js` - Belt A/B card lists
- `src/utils/packConstants.js` - `SETS_1_3_CONSTANTS`
