# Belt System Documentation

This document describes the belt system used for generating booster packs.

## Manufacturing Principle

We mimic a physical card manufacturing process. The belt is a cyclic conveyor
that dispenses cards in order. We do NOT use post-hoc fixes or manual corrections.
Instead, we ensure the belt is constructed properly from the start.

The correct way to guarantee aspect coverage is to ensure that every segment
of N cards (where N = number of slots filled from this belt) contains the
required aspects. This is handled during belt construction, not after pack generation.

## Overview

A **belt** is a cyclic queue of cards that provides cards for pack generation. Cards are drawn from the front of the belt, and when the belt runs low, it refills with a shuffled "boot" of cards.

## Belt Types

### Common Belts (A and B)

Each set has two common belts that provide the 9 commons in each pack:

- **Belt A**: Primary belt, fills most slots
- **Belt B**: Secondary belt, fills remaining slots

The slot assignments vary by block (see Block Definitions below).

### Other Belts

| Belt | Purpose |
|------|---------|
| LeaderBelt | Provides leader cards |
| BaseBelt | Provides base cards |
| UncommonBelt | Provides uncommon cards |
| RareLegendaryBelt | Provides rare/legendary cards |
| FoilBelt | Provides foil cards |
| HyperspaceLeaderBelt | Provides hyperspace variant leaders |
| HyperspaceBaseBelt | Provides hyperspace variant bases |
| HyperspaceUncommonBelt | Provides hyperspace variant uncommons |
| HyperspaceRareLegendaryBelt | Provides hyperspace variant rare/legendary |
| HyperfoilBelt | Provides hyperspace foil cards |
| ShowcaseLeaderBelt | Provides showcase variant leaders |

## Block Definitions

Cards are assigned to belts differently based on which block the set belongs to.

### Block 0 (Sets 1-3: SOR, SHD, TWI)

**Belt A (60 cards)**:
- Vigilance (Blue)
- Command (Green)
- Aggression (Red)
- Some Neutral cards moved from B to balance

**Belt B (30 cards)**:
- Cunning (Yellow)
- Villainy
- Heroism
- Neutral (remaining after balancing)

**Slot Pattern** (9 commons per pack):
- Slots 1-6: Belt A
- Slots 7-9: Belt B

**Belt Size Ratio**: 2:1 (60 cards : 30 cards)

**Hyperspace Upgrade Slot**: Slot 6

**Segment Constraints**:
- Belt A: Every segment of 6 cards has at least 1 Blue, 1 Green, 1 Red
- Belt B: Every segment of 3 cards has at least 1 Yellow

### Block A (Sets 4-6: JTL, LOF, SEC)

**Belt A (50 cards)**:
- Vigilance (Blue)
- Command (Green)
- Villainy

**Belt B (50 cards)**:
- Aggression (Red)
- Cunning (Yellow)
- Heroism
- Neutral

**Slot Pattern** (9 commons per pack):
- Slots 1-4: Belt A
- Slot 5: Alternates between Belt A and Belt B each pack
- Slots 6-9: Belt B

**Belt Size Ratio**: 1:1 (50 cards : 50 cards)

**Hyperspace Upgrade Slot**: Slot 4

**Segment Constraints**:
- Belt A: Every segment of 4 cards has at least 1 Blue, 1 Green
- Belt B: Every segment of 4 cards has at least 1 Red, 1 Yellow

### Block B (Sets 7+)

TBD - Currently defaults to Block A pattern.

## Static Belt Assignments

Common cards are statically assigned to belts in:
```
src/belts/data/commonBeltAssignments.js
```

This file is designed to be easily editable by hand. Each set has a `beltA` and `beltB` array containing card names.

### Assignment Rules

1. Cards are initially assigned based on their aspects
2. If belt sizes don't match targets, flexible cards are moved to balance:
   - Mono-Villainy cards
   - Mono-Heroism cards
   - Neutral cards (no aspects)
3. Final belt sizes must match the block's target sizes

### Balancing Algorithm

For Block 0:
1. Start with aspect-based assignment
2. Move mono-Villainy/Heroism/Neutral from B to A until A = 60
3. Verify final counts: A = 60, B = 30

For Block A:
1. Start with aspect-based assignment
2. Move flexible cards between belts until balanced
3. Verify final counts: A = 50, B = 50

## Seam-Aware Belt Refill

When the belt hopper runs low, we use a seam-aware refill strategy to ensure aspect coverage is maintained even across boot boundaries.

### The Seam Problem

When a belt refills, there's a "seam" between the old boot's remaining cards and the new boot's cards. A draw that spans this seam could potentially lack required aspects if not handled carefully.

### Refill Threshold

The belt refills when it has exactly `drawSize` cards left:
- Block 0 Belt A: refill at ≤6 cards (draws 6 per pack)
- Block 0 Belt B: refill at ≤3 cards (draws 3 per pack)
- Block A Belt A: refill at ≤4 cards (draws 4 per pack)
- Block A Belt B: refill at ≤4 cards (draws 4 per pack)

### Seam-Aware Construction

When building a new boot, we pass the remaining "seam cards" to the boot construction algorithm:

1. **Analyze seam cards**: Determine which required aspects the seam cards already have
2. **Find missing aspects**: Identify aspects that must appear in the first positions of the new boot
3. **Place complementary cards first**: The first `(drawSize - seamCards.length)` positions get cards with missing aspects
4. **Fill remainder normally**: Remaining positions use the standard constrained construction

Example for Belt A (drawSize=6, requires B,G,R):
- Seam has 3 cards: [B,B,G] → covers B,G but missing R
- New boot's first 3 positions must include at least 1 R card
- The seam window [seam0, seam1, seam2, boot0, boot1, boot2] will satisfy constraints

### Testing

Seam-aware behavior is tested in `src/qa/seamAwareBelt.test.js`:
- Refill threshold tests for each belt type
- 100-pack consecutive draw tests for aspect coverage
- Cross-seam verification tests
- All-sets coverage tests

## Deduplication

### Within-Belt Deduplication

- 12-card deduplication window prevents same card appearing close together
- Cards are skipped during boot generation if they're in the recent IDs window
- Seam cards are pre-loaded into the deduplication window at refill time

### Within-Pack Deduplication

There is no post-pack deduplication pass.

- We do not inspect a finished pack and replace cards after the fact
- If two cards should not appear together, that constraint belongs in the belt layout or upgrade-budget logic
- This is the core printer metaphor: prevention comes from sheet/belt spacing, not cleanup after random generation

## Color Proximity Rules

**Note**: With static belt assignments, color proximity is handled differently:
- Cards are shuffled within their belt
- No special aspect ordering is enforced within the belt
- Aspect coverage comes from the slot-to-belt mapping

## Hyperspace Upgrades

### HyperspaceUpgradeBelt (Sets 1-6)

HS upgrades are controlled by a **budget belt** (`src/belts/HyperspaceUpgradeBelt.ts`),
not independent coin flips. This mimics physical print sheet collation, giving tighter
variance than pure probability.

Each cycle of 60 packs pre-determines the HS budget:
- 20 packs get 0 HS upgrades (1/3 of packs have no HS)
- 30 packs get 1 HS upgrade
- 10 packs get 2 HS upgrades (leader+base never co-occur)

The belt also pre-assigns *which slots* get upgraded in each pack, ensuring per-slot
rates match targets (leader 1/6, base 1/6, R/L 1/15, etc.) while controlling the
total count.

### Common Hyperspace Slot

When a hyperspace upgrade occurs on a common slot:
1. The upgrade happens at the designated slot (Block 0: slot 6, Block A: slot 4)
2. The slot is replaced with the next card from `HyperspaceCommonBelt`
3. The pack is not re-written afterward

This keeps upgrades printer-faithful: the slot budget comes from `HyperspaceUpgradeBelt`, while the upgraded card itself comes from its own print-like variant belt.

## Regenerating Belt Assignments

To regenerate the belt assignments from card data:

```bash
node scripts/writeBeltAssignments.cjs
```

This will:
1. Read all commons from each set
2. Assign them to belts based on aspects
3. Balance belt sizes
4. Write the assignments to `src/belts/data/commonBeltAssignments.js`

## Testing

Belt tests are in:
- `src/belts/CommonBelt.test.js`
- `src/belts/HyperspaceUpgradeBelt.test.ts`
- `src/qa/packGeneration.test.js`
- `src/qa/hyperspaceDistribution.test.ts`

Key test scenarios:
- Belt assignment sizes match targets
- No duplicates within dedup window
- Slot patterns are correct for each block
- Hyperspace upgrades happen in correct slot
- HS budget distribution: 1/3 of packs have 0 HS, max 2 per pack
- Leader + base HS never co-occur
- Z-score for 3 HS is ≥3σ (statistically rare)
- Per-slot HS rates match targets (leader 1/6, base 1/6, UC3→HS R/L 1/7.5)
- NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
