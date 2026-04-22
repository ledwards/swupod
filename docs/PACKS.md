# Pack Generation Documentation

This document describes how booster packs are generated.

## Pack Structure

Each booster pack contains 16 cards:

| Slot | Card Type | Count |
|------|-----------|-------|
| 1 | Leader | 1 |
| 2 | Base | 1 |
| 3-11 | Commons | 9 |
| 12-14 | Uncommons | 3 |
| 15 | Rare/Legendary | 1 |
| 16 | Foil | 1 |

## Common Slot Distribution

Commons are drawn from two belts (A and B) based on the set's block.

### Block 0 (SOR, SHD, TWI)

```
Slot 1: Belt A
Slot 2: Belt A
Slot 3: Belt A
Slot 4: Belt A
Slot 5: Belt A
Slot 6: Belt A  ← Hyperspace upgrade slot
Slot 7: Belt B
Slot 8: Belt B
Slot 9: Belt B
```

### Block A (JTL, LOF, SEC)

```
Slot 1: Belt A
Slot 2: Belt A
Slot 3: Belt A
Slot 4: Belt A  ← Hyperspace upgrade slot
Slot 5: Alternates (A or B each pack)
Slot 6: Belt B
Slot 7: Belt B
Slot 8: Belt B
Slot 9: Belt B
```

## Upgrade System

After the base pack is assembled, an upgrade pass may modify certain slots.

### HyperspaceUpgradeBelt (Sets 1-6)

HS upgrades use a **budget belt** instead of independent coin flips. Each cycle of 60 packs
pre-determines how many HS upgrades each pack receives:

- **20 packs** (33.3%) get **0 HS** upgrades
- **30 packs** (50.0%) get **1 HS** upgrade
- **10 packs** (16.7%) get **2 HS** upgrades

This gives μ = 0.833 HS/pack with σ ≈ 0.70, ensuring that 3 HS per pack is a ≥3σ outlier.
Leader and base HS never co-occur in the same pack.

### Upgrade Types

| Upgrade | Description | Mechanism | Effective Rate |
|---------|-------------|-----------|---------------|
| Leader → Showcase | Replace slot with fresh Showcase leader draw | ShowcaseLeaderBelt | 1/288 |
| Leader → Hyperspace | Replace slot with fresh HS leader draw | HyperspaceLeaderBelt + HyperspaceUpgradeBelt | 1/6 |
| Base → Hyperspace | Replace slot with fresh HS base draw | HyperspaceBaseBelt + HyperspaceUpgradeBelt | 1/6 |
| Foil → Hyperfoil | Draw random HS foil | Independent coin flip | 1/50 |
| UC1 → HS Uncommon | Replace slot with fresh HS uncommon draw | HyperspaceUncommonBelt + HyperspaceUpgradeBelt | 1/15 |
| UC2 → HS Uncommon | Replace slot with fresh HS uncommon draw | HyperspaceUncommonBelt + HyperspaceUpgradeBelt | 1/30 |
| UC3 → HS Rare/Legendary | Draw random HS R/L | HyperspaceUpgradeBelt | 1/7.5 |
| Common → Hyperspace | Replace designated common slot with fresh HS common draw | HyperspaceCommonBelt + HyperspaceUpgradeBelt | 1/5 |

**NOTE:** The rare slot NEVER upgrades to Hyperspace. HS rares/legendaries only appear via UC3 upgrade.

### Common Hyperspace Upgrade

The common hyperspace upgrade works differently from other upgrades:

1. **Fixed Slot**: The upgrade always happens at a specific slot
   - Block 0: Slot 6
   - Block A: Slot 4

2. **Fresh Belt Pull**: The slot is replaced with the next card from `HyperspaceCommonBelt`

3. **No Post-Hoc Cleanup**: We do not inspect the finished pack and "fix" duplicates afterward

This keeps upgrades printer-faithful: the upgrade slot is budgeted by the upgrade belt, and the upgraded card itself comes from its own variant belt.

## Aspect Coverage

The belt system guarantees aspect coverage through proper manufacturing, not post-hoc fixes.

### Manufacturing Principle

We mimic a physical card manufacturing process. The belt is a cyclic conveyor
that dispenses cards in order. We do NOT use post-hoc fixes or manual corrections.
Instead, we ensure the belt is constructed properly from the start.

The correct way to guarantee aspect coverage is to ensure that every segment
of N cards (where N = number of slots filled from this belt) contains the
required aspects. This is handled during belt construction, not after pack generation.

### Block 0 (Sets 1-3)
- Belt A (60 cards, fills slots 1-6): Every segment of 6 cards has at least 1 Blue, 1 Green, 1 Red
- Belt B (30 cards, fills slots 7-9): Every segment of 3 cards has at least 1 Yellow
- Combined: All basic aspects (B, G, R, Y) guaranteed in every pack

### Block A (Sets 4-6)
- Belt A (50 cards, fills slots 1-4): Every segment of 4 cards has at least 1 Blue, 1 Green
- Belt B (50 cards, fills slots 6-9): Every segment of 4 cards has at least 1 Red, 1 Yellow
- Combined: All basic aspects (B, G, R, Y) guaranteed in every pack

### Algorithm

The belt construction algorithm:
1. Categorizes cards by their aspect coverage (single-aspect, multi-aspect, other)
2. Evenly distributes aspect cards across the belt
3. Fills remaining slots with other cards
4. Shuffles for randomness while maintaining aspect spacing

### Seam-Aware Refill

When a belt refills, we use seam-aware construction to maintain aspect coverage across boot boundaries:

1. **Refill threshold**: Belt refills when it has exactly `drawSize` cards left
2. **Seam analysis**: The remaining cards (seam cards) are analyzed for their aspects
3. **Complementary construction**: New boot's first positions get cards with aspects missing from seam
4. **Result**: Any draw spanning the seam still satisfies aspect constraints

This ensures 100% aspect coverage even after many refill cycles.

See `docs/BELTS.md` for detailed seam-aware refill documentation.

## Sealed Pod Generation

A sealed pod consists of 6 booster packs:

```javascript
generateSealedPod(cards, setCode, packCount = 6)
```

Key behaviors:
1. Belt cache is cleared before generating a pod
2. This ensures each sealed pool starts with a fresh belt state
3. Packs are generated sequentially, with belts advancing between packs

## Configuration

Pack generation constants are in:
```
src/utils/packConstants.ts
```

Set-specific configurations are in:
```
src/utils/setConfigs/
```

## Testing

Pack tests are in:
- `src/utils/boosterPack.test.ts` - Unit tests
- `src/qa/packGeneration.test.ts` - Statistical QA tests

Key test scenarios:
- All packs have exactly 16 cards
- No duplicate base treatment cards within a pack
- Normal common belts do not need a post-pack dedupe pass
- Aspect coverage validation
- Hyperspace upgrade rates
- Card variety distribution

## Known Learnings

### From Physical Box Opens

1. **Belt Sizes**: Block 0 uses 60/30 split, Block A uses 50/50 split
2. **Slot Patterns**: Physical packs follow consistent slot-to-belt patterns
3. **Hyperspace Slots**: Fixed slots for hyperspace upgrades (not random)
4. **Alternating Slot**: Block A slot 5 alternates between belts

### Edge Cases

1. **Small Belt**: If belt is smaller than dedup window, cards may appear closer together
2. **Missing Cards**: If a card name in assignments doesn't match the database, it's skipped with a warning
3. **No Pack-Level Dedupe**: If a duplicate can happen, the fix must be in belt construction or slot budgeting, not by rewriting the finished pack

## File Locations

| File | Purpose |
|------|---------|
| `src/utils/boosterPack.ts` | Main pack generation logic |
| `src/utils/packConstants.ts` | Pack structure constants |
| `src/belts/CommonBelt.ts` | Common belt implementation |
| `src/belts/data/commonBeltAssignments.ts` | Static belt assignments |
| `scripts/writeBeltAssignments.cjs` | Regenerate belt assignments |
