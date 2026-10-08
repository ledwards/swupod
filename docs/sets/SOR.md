# SOR - Spark of Rebellion

> **LLM INSTRUCTION**: Keep this document up to date whenever SOR-related pack generation logic, belt assignments, rarity weights, or configurations change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | SOR |
| Set Number | 1 |
| Set Name | Spark of Rebellion |
| Release Date | 2024-03-08 |
| Block | 0 |
| Color | `#E31837` (Red) |

## Card Counts

| Category | Count |
|----------|-------|
| Total Cards | ~991 (all variants) |
| Leaders (Common) | 8 |
| Leaders (Rare) | 8 |
| Leaders (Total) | 16 |
| Bases (Common) | 10 |
| Bases (Rare) | 0 |
| Bases (Total) | 10 |
| Commons | 90 |
| Uncommons | 60 |
| Rares | 50 |
| Legendaries | 22 |
| Specials | 0 |

## Pack Construction

### Standard Pack (16 cards)
1. **Leader** (1) - From LeaderBelt, alternating Common/Rare
2. **Base** (1) - Common only (no rare bases in SOR)
3. **Commons** (9) - Slots 1-6 from Belt A, slots 7-9 from Belt B
4. **Uncommons** (3) - From UncommonBelt
5. **Rare/Legendary** (1) - 7:1 ratio (1 in 8 legendary)
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

- **No Special Rarity**: SOR has no Special rarity cards
- **No Rare Bases**: All bases are Common
- **Showcase Leaders**: Very rare (~1 in 288 packs)

## Limited/Draft Play

> Note: These rankings are used by bot AI for drafting. Data sourced from Dexerto tier lists, GarbageRollers draft guides, swumetastats.com, and community consensus.

### Leader Rankings (Best to Worst)

| Rank | Leader | Aspects | Notes |
|------|--------|---------|-------|
| 1 | Sabine Wren | Aggression/Heroism | Dominates limited, fast aggro |
| 2 | Boba Fett | Cunning/Villainy | Most formidable overall |
| 3 | Darth Vader | Aggression/Villainy | Strong aggression |
| 4 | Han Solo | Cunning/Heroism | Solid cunning value |
| 5 | Grand Moff Tarkin | Command/Villainy | Straightforward, solid in limited |
| 6 | Luke Skywalker | Vigilance/Heroism | Good vigilance option |
| 7 | Leia Organa | Command/Heroism | Solid command |
| 8 | Hera Syndulla | Command/Heroism | Command/heroism |
| 9 | Cassian Andor | Aggression/Heroism | Aggression/heroism |
| 10 | Grand Inquisitor | Aggression/Villainy | Aggression/villainy |
| 11 | Emperor Palpatine | Command/Villainy | Command/villainy |
| 12 | Chewbacca | Vigilance/Heroism | Vigilance/heroism |
| 13 | Director Krennic | Vigilance/Villainy | Vigilance/villainy |
| 14 | IG-88 | Aggression/Villainy | Aggression/villainy |
| 15 | Chirrut Îmwe | Vigilance/Heroism | Vigilance/heroism |
| 16 | Grand Admiral Thrawn | Cunning/Villainy | Cunning/villainy |
| 17 | Iden Versio | Vigilance/Villainy | Vigilance/villainy |
| 18 | Jyn Erso | Cunning/Heroism | Cunning/heroism |

### Powerful Cards

Cards that overperform in limited play (used by bot AI for drafting with +25 bonus):

**Removal:**
- Vanquish
- Takedown
- Force Choke
- Open Fire
- Superlaser Blast

**Strong Units:**
- Snowspeeder
- Wing Leader
- Fleet Lieutenant
- Viper Probe Droid
- Cantina Bouncer
- Battlefield Marine
- Cell Block Guard
- Frontier AT-RT
- Wolffe
- Asteroid Sanctuary

**Value Cards:**
- Coordinate
- Repair
- Strike True
- For a Cause I Believe In

## Related Files

- `src/utils/setConfigs/SOR.js` - Set configuration
- `src/belts/data/commonBeltAssignments.js` - Belt A/B card lists
- `src/utils/packConstants.js` - `SETS_1_3_CONSTANTS`
