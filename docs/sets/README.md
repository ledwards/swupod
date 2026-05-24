# Set Documentation

This directory contains detailed documentation for each Star Wars: Unlimited set's pack construction, collation rules, and rarity distribution.

> **LLM INSTRUCTION**: Keep these documents up to date whenever pack generation logic, belt assignments, rarity weights, or set configurations change. When modifying any set-related code, update the corresponding set documentation file.

## Sets

| Set | Code | Block | Release Date | Status |
|-----|------|-------|--------------|--------|
| [Spark of Rebellion](SOR.md) | SOR | 0 | 2024-03-08 | Released |
| [Shadows of the Galaxy](SHD.md) | SHD | 0 | 2024-07-12 | Released |
| [Twilight of the Republic](TWI.md) | TWI | 0 | 2024-11-08 | Released |
| [Jump to Lightspeed](JTL.md) | JTL | A | 2025-03-14 | Released |
| [Legends of the Force](LOF.md) | LOF | A | 2025-07-11 | Released |
| [Secrets of Power](SEC.md) | SEC | A | 2025-11-07 | Released |
| [A Lawless Time](LAW.md) | LAW | B | 2026-03-13 | Released |
| [Ashes of the Empire](ASH.md) | ASH | B | 2026-07-17 | Spoiler Beta |

## Block Definitions

### Block 0 (Sets 1-3: SOR, SHD, TWI)
- Belt A: Vigilance, Command, Aggression (60 cards)
- Belt B: Cunning, Villainy, Heroism, Neutral (30 cards)
- Belt A fills slots 1-6, Belt B fills slots 7-9
- Hyperspace upgrades in slot 6
- 7:1 rare-to-legendary ratio (1 in 8)

### Block A (Sets 4-6: JTL, LOF, SEC)
- Belt A: Vigilance, Command, Villainy (50 cards)
- Belt B: Aggression, Cunning, Heroism, Neutral (50 cards)
- Belt A fills slots 1-4, slot 5 alternates, Belt B fills slots 6-9
- Hyperspace upgrades in slot 4
- 5:1 rare-to-legendary ratio
- Special rarity cards appear in packs

### Block B (Sets 7+: LAW, ASH)
- LAW-style two common belts: Belt A fills slots 1-4, Belt B fills slots 6-9
- Slot 5 is GUARANTEED Hyperspace common
- Foil slot is ALWAYS Hyperspace Foil (no regular foils)
- Prestige cards can appear in standard packs (~1 in 18)
- Triple-aspect cards (double primary aspect)
- Rare bases stay in the rare slot unless a future set config opts into base-slot rares

## Pack Structure (All Sets)

Standard booster pack contains 16 cards:
1. 1 Leader
2. 1 Base
3. 9 Commons (from Belt A and Belt B)
4. 3 Uncommons
5. 1 Rare or Legendary
6. 1 Foil (any rarity)

## Limited/Draft Play Information

Each set document includes:
- **Leader Rankings**: Ranked list of leaders for limited/draft play (best to worst)
- **Powerful Cards**: Cards that overperform in limited, used by bot AI

This data is sourced from:
- Dexerto tier lists
- GarbageRollers draft guides
- swumetastats.com tournament data
- Community consensus from limited play

See `src/bots/behaviors/PopularLeaderBehavior.js` for leader rankings and `src/bots/data/powerfulCards.js` for powerful cards.

## Related Files

- `src/utils/packConstants.js` - Probability constants and weights
- `src/utils/setConfigs/` - Per-set configuration files
- `src/belts/data/commonBeltAssignments.js` - Belt card assignments
- `src/utils/boosterPack.js` - Pack generation logic
- `src/bots/behaviors/PopularLeaderBehavior.js` - Leader rankings for bot AI
- `src/bots/data/powerfulCards.js` - Powerful cards for bot AI
