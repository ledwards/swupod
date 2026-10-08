# SEC - Secrets of Power

> **LLM INSTRUCTION**: Keep this document up to date whenever SEC-related pack generation logic, belt assignments, rarity weights, or configurations change.

## Overview

| Property | Value |
|----------|-------|
| Set Code | SEC |
| Set Number | 6 |
| Set Name | Secrets of Power |
| Release Date | 2025-11-07 |
| Block | A |
| Color | `#6A1B9A` (Dark Purple) |

## Card Counts

| Category | Count |
|----------|-------|
| Total Cards | ~1155 (all variants) |
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

### Belt B (50 cards)
See `src/belts/data/commonBeltAssignments.js` for full list.

Key aspects: Aggression (Red), Cunning (Yellow), Heroism, Neutral

## Special Rules

- **Special Rarity**: Special rarity cards appear in packs
- **No Rare Bases**: All bases are Common
- **Politics Theme**: Focus on political intrigue and galactic governance
- **Last Block A Set**: Final set before major pack rule changes in LAW

## Limited/Draft Play

> Note: These rankings are used by bot AI for drafting. Data sourced from Dexerto tier lists, GarbageRollers draft guides, swumetastats.com, and community consensus.

### Leader Rankings (Best to Worst)

| Rank | Leader | Aspects | Notes |
|------|--------|---------|-------|
| 1 | Leia Organa | Vigilance/Heroism | Top pick |
| 2 | Sly Moore | Cunning/Villainy | Cunning/villainy |
| 3 | Colonel Yularen | Command/Villainy | Command/villainy |
| 4 | Jabba the Hutt | Vigilance/Villainy | Vigilance/villainy |
| 5 | Mon Mothma | Command/Heroism | Command/heroism |
| 6 | Dedra Meero | Aggression/Villainy | Aggression/villainy |
| 7 | Sabé | Cunning/Heroism | Cunning/heroism |
| 8 | Chancellor Palpatine | Vigilance/Villainy | Versatile |
| 9 | Cassian Andor | Aggression/Heroism | Aggression/heroism |
| 10 | Governor Pryce | Aggression/Villainy | Aggression/villainy |
| 11 | Luthen Rael | Aggression/Heroism | Aggression/heroism |
| 12 | Dryden Vos | Command/Villainy | Command/villainy |
| 13 | Bail Organa | Command/Heroism | Command/heroism |
| 14 | Satine Kryze | Vigilance/Heroism | Vigilance/heroism |
| 15 | Padmé Amidala | Cunning/Heroism | Cunning/heroism |
| 16 | Lama Su | Vigilance/Villainy | Vigilance/villainy |
| 17 | C-3P0 | Cunning/Heroism | Cunning/heroism |
| 18 | DJ | Cunning/Cunning | Unique double-cunning |

### Powerful Cards

Cards that overperform in limited play (used by bot AI for drafting with +25 bonus):

**Top Tier Units:**
- Imperial Dark Trooper
- Imperial Occupier
- Sith Assassin
- Viper Probe Droid
- Warrior of Clan Ordo
- Outer Rim Constable
- Chandrilan Sponsor
- Death Trooper
- Hunting Assassin Droid
- Lurking Snub Fighter
- Populist Champion
- Daro Commando
- Academy Disciplinarian
- Rotunda Senate Guards
- Heroic ARC-170
- Enforcer Squadron
- Nubian Star Skiff
- Cruel Commandos
- FN Trooper Corps
- Dressellian Commando
- Dogmatic Shock Squad
- Naboo Security Force
- Jade Squadron Patrol
- Shadow Crawler
- Screeching TIE Fighter
- Muckraker Crab Droid
- Rebel Propagandist
- Umbaran Mobile Cannon
- Taylander Shuttle

**Key Events and Upgrades:**
- Sudden Ferocity
- Beguile
- Let's Call it War
- Loan Shark
- Ando Commission
- Unveiled Might
- Grass Roots Resistance
- Trade Federation Delegates
- Aggressive Negotiations
- Emergency Powers

**Strong Named Characters:**
- Mina Bonteri
- Bail Organa
- Hired Slicer
- Cikatro Vizago
- Senator Chuchi
- Mas Ameda
- Kazuda Xiono
- Elia Kane
- Dedra Meero
- Renowned Dignitaries
- Cantwell Arrestor Cruiser
- Darth Nihilus
- Chancellor Palpatine
- Alexsandr Kallus
- The Mandalorian
- Queen Amidala
- Mon Mothma
- Captain Rex
- Bo Katan
- Karis Nemik
- Darth Scion

**Ships:**
- Lightmaker
- First Light
- Crucible
- Fulminatrix

## Related Files

- `src/utils/setConfigs/SEC.js` - Set configuration
- `src/belts/data/commonBeltAssignments.js` - Belt A/B card lists
- `src/utils/packConstants.js` - `SETS_4_6_CONSTANTS`
