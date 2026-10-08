# TWI - Twilight of the Republic

> **LLM INSTRUCTION**: Keep this document up to date whenever TWI-related pack generation logic, belt assignments, rarity weights, or configurations change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | TWI |
| Set Number | 3 |
| Set Name | Twilight of the Republic |
| Release Date | 2024-11-08 |
| Block | 0 |
| Color | `#1E3A5F` (Dark Blue) |

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

- **No Special Rarity**: TWI has no Special rarity cards
- **Rare Bases**: 2 rare bases appear in the Rare slot
- **Clone Wars Theme**: Focus on Republic and Separatist era

## Limited/Draft Play

> Note: These rankings are used by bot AI for drafting. Data sourced from Dexerto tier lists, GarbageRollers draft guides, swumetastats.com, and community consensus.

### Leader Rankings (Best to Worst)

| Rank | Leader | Aspects | Notes |
|------|--------|---------|-------|
| 1 | Yoda | Vigilance/Heroism | 51% win rate |
| 2 | Anakin Skywalker | Aggression/Heroism | Excellent design, units trade up |
| 3 | Quinlan Vos | Cunning/Heroism | Clear upgrade on deployment |
| 4 | Obi-Wan Kenobi | Vigilance/Heroism | Solid vigilance/heroism |
| 5 | Captain Rex | Command/Heroism | Command/heroism |
| 6 | Mace Windu | Aggression/Heroism | Aggression/heroism |
| 7 | Maul | Aggression/Villainy | Aggression/villainy |
| 8 | Asajj Ventress | Cunning/Villainy | Cunning/villainy |
| 9 | Jango Fett | Cunning/Villainy | Cunning/villainy |
| 10 | Ahsoka Tano | Aggression/Heroism | Aggression/heroism |
| 11 | Count Dooku | Command/Villainy | Command/villainy |
| 12 | Padmé Amidala | Command/Heroism | Command/heroism |
| 13 | Nala Se | Vigilance/Villainy | Vigilance/villainy |
| 14 | Nute Gunray | Vigilance/Villainy | Vigilance/villainy |
| 15 | General Grievous | Cunning/Villainy | Cunning/villainy |
| 16 | Wat Tambor | Command/Villainy | Beast in limited |
| 17 | Pre Vizsla | Aggression/Villainy | Aggression/villainy |
| 18 | Chancellor Palpatine | Command/Villainy | Complex but powerful |

### Powerful Cards

Cards that overperform in limited play (used by bot AI for drafting with +25 bonus):

- Viper Probe Droid
- Coordinate

## Related Files

- `src/utils/setConfigs/TWI.js` - Set configuration
- `src/belts/data/commonBeltAssignments.js` - Belt A/B card lists
- `src/utils/packConstants.js` - `SETS_1_3_CONSTANTS`
