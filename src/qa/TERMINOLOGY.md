# Terminology Guide

## Base Treatment vs. Variants

When discussing duplicates in pack generation, it's crucial to understand the distinction between **base treatments** and **variant types**.

## What Counts as a Duplicate?

**Duplicates** are multiple copies of the same card **with the same variant type** appearing in a single pack.

### ❌ These ARE Duplicates (Invalid):
- Two "Pounce" (Normal) cards in one pack
- Two "Fleet Lieutenant" (Foil) cards in one pack
- Two "Jedha Agitator" (Hyperspace) cards in one pack

### ✅ These are NOT Duplicates (Valid):
- "Pounce" (Normal) + "Pounce" (Foil) in one pack
- "Pounce" (Normal) + "Pounce" (Hyperspace) in one pack
- "Pounce" (Foil) + "Pounce" (Hyperspace Foil) in one pack
- "Boba Fett" (Normal) + "Boba Fett" (Showcase) in one pack

## Variant Types

The following variant types are treated as **distinct cards** for duplicate detection:

1. **Normal** - Base treatment, standard card
2. **Foil** - Foil version of the card
3. **Hyperspace** - Hyperspace variant
4. **Hyperspace Foil** - Foil version of Hyperspace variant
5. **Showcase** - Showcase variant (special art/frame)

## Why This Matters

In a 16-card booster pack:
- 15 slots are "regular" cards
- 1 slot is the "foil" slot

The foil slot can contain a foil version of ANY card in the set. This means:
- You could pull "Card A" (Normal) in slot 5
- You could pull "Card A" (Foil) in slot 16 (the foil slot)
- This is **perfectly valid** and not a duplicate

## Testing Logic

Our QA tests use the following logic:

```javascript
// Create unique key for duplicate detection
const key = `${card.id}-${card.variantType}`

// Example keys:
"SOR-224-Normal"      // Pounce (Normal)
"SOR-224-Foil"        // Pounce (Foil) - Different key!
"SOR-224-Hyperspace"  // Pounce (Hyperspace) - Different key!
```

Each unique combination of `card.id` + `variantType` is treated as a distinct card.

## Cross-Pack Duplicates (Sealed Pods)

When analyzing duplicates **across a sealed pod** (6 packs, 96 cards total):

- Duplicates of the same base treatment ARE expected and normal
- The birthday paradox guarantees some duplicates
- We use statistical analysis to ensure the distribution is reasonable

### Expected Behavior:
- **3-4 duplicate cards per sealed pod** (mean)
- Standard deviation of ~2-3 cards
- Some pods with 0 duplicates, some with 8-10 (both normal)

### Statistical Validation:
- No 3σ outliers (would indicate systematic bias)
- ~5% of pods are 2σ outliers (statistically normal)
- Outlier distribution itself is tested

## Common Misunderstandings

### ❌ "Foils shouldn't duplicate with regular cards"
**Incorrect.** Foils are a different variant type and don't count as duplicates.

### ❌ "A sealed pod should have no duplicate cards"
**Incorrect.** With ~45 commons and 54 common slots across 6 packs, duplicates are mathematically inevitable and expected.

### ❌ "All duplicates are bugs"
**Incorrect.** Only duplicates **of the same base treatment within a single pack** are bugs.

### ✅ "Two Normal variants of the same card in one pack is a bug"
**Correct!** This should never happen and is what the QA tests flag as failures.

## Summary

**The Bug We're Testing For:**
- Same card with same variant type appearing twice in a 16-card pack
- Example: "Pounce" [Normal] at positions 5 and 12 in the same pack

**What's Working Correctly:**
- Different variant types in the same pack (Normal + Foil)
- Duplicates across a sealed pod (expected behavior)
- Statistical distribution of cross-pod duplicates (3-4 per pod average)

## Key Takeaway

When we say "duplicate," we specifically mean **duplicate base treatment** - the same card with the same variant type. Different treatments of the same card are completely valid and expected.