# Example Test Output

This file shows what the colorized test output looks like when running tests.

## Quick Summary (`npm run test:summary`)

```
🚀 Running Test Suite
================================

📦 Running Booster Pack Tests...
  ✅ Passed: 24

🎯 Running Belt Tests...
  ✅ Passed: 11

🎴 Running Data Validation...
  ❌ Failed: 24

================================
Test Summary
================================
✅ Total Passed: 95
❌ Total Failed: 24
⚠️ Failed Suites: 1

💥 TESTS FAILED

Run individual test suites for details:
  npm run test:utils
  npm run test:belts
  npm run test:data
  npm run qa
```

## Individual Test Suite (`npm run test:utils`)

```
🔄 Initializing card cache...
Card cache initialized with 4973 total cards

📦 Booster Pack Tests
======================
✅ generateBoosterPack returns pack with cards array
✅ pack contains exactly 16 cards
✅ pack contains exactly 1 leader
✅ pack contains exactly 1 base
✅ pack contains 9 commons
✅ pack contains 3 uncommons
✅ pack contains 1 rare or legendary
✅ pack contains exactly 1 foil card
✅ foil card is marked with isFoil flag
✅ leader is marked with isLeader flag
✅ base is marked with isBase flag
✅ common cards have Common rarity
✅ uncommon cards have Uncommon rarity
✅ rare/legendary card has Rare or Legendary rarity
✅ cards alternate between Belt A and Belt B aspects
✅ generateSealedPod returns 6 packs by default
✅ generateSealedPod returns specified number of packs
✅ each pack in sealed pod has correct structure
✅ leaders in sealed pod come from belt (sequential, not random)
✅ clearBeltCache causes new belt initialization
✅ commons alternate between Belt A and Belt B aspects across packs
✅ over many packs, some leaders get upgraded to Hyperspace
✅ over many packs, some bases get upgraded to Hyperspace
✅ showcase leader upgrade uses Showcase variant

======================
✅ Tests passed: 24
   Tests failed: 0

🎉 ALL TESTS PASSED!
```

## Belt Test Example (`node src/belts/LeaderBelt.test.js`)

```
🔄 Initializing card cache...
Card cache initialized with 4973 total cards

👑 LeaderBelt Tests
========================================
✅ initializes with a set code and loads only leaders
✅ separates leaders into common and rare
✅ hopper is filled on initialization
✅ next() returns a leader card
✅ next() removes card from hopper
✅ next() returns a copy, not the original
✅ hopper refills when depleted
✅ commons appear more frequently than rares in hopper
✅ no duplicate leaders within 6 slots of each other (seam dedup)
✅ different belt instances start at different positions
✅ peek() returns cards without removing them

========================================
✅ Tests passed: 11
   Tests failed: 0

🎉 ALL TESTS PASSED!
```

## Data Validation (`npm run test:data`)

```
🔄 Initializing card cache...
Card cache initialized with 4973 total cards

🎴 Card Data Validation Tests
==============================
✅ SOR: has card data
✅ SOR: all cards have required fields
✅ SOR: all cards have valid variant types
✅ SOR: all cards have valid rarities
✅ SOR: no duplicate Normal variant cards
✅ SOR: leaders have isLeader flag
✅ SOR: bases have isBase flag
✅ SOR: foil cards have isFoil flag
❌ SOR: Hyperspace cards have isHyperspace flag
   Hyperspace card "2-1B Surgical Droid" (SOR-324) missing isHyperspace flag
❌ SOR: Showcase cards have isShowcase flag
   Showcase card "Boba Fett" (SOR-265) missing isShowcase flag
✅ SOR: all Normal variant cards have image URLs
✅ SOR: leaders with backText have backImageUrl
✅ SOR: units have power and hp
❌ SOR: non-units/leaders have null power and hp
   Non-combat card "Academy Training" (SOR-120) should have null power
...

==============================
✅ Tests passed: 60
❌ Tests failed: 24

💥 DATA VALIDATION FAILED
```

## QA Test Sample (`npm run qa`)

```
📊 Pack Generation QA
============================
📦 Pod sample size: 100 (600 packs total)
📏 Tolerance: 15%

🔄 Initializing card cache...
Card cache initialized with 4973 total cards

=== 🎴 SOR ===
🎁 Generating 100 sealed pods (600 packs)...
✔️  Generation complete.

📦 Testing Individual Packs...
✅ SOR: all packs have 16 cards
✅ SOR: all packs have exactly 1 leader
✅ SOR: all packs have exactly 1 base
✅ SOR: all packs have exactly 1 foil
❌ SOR: no duplicate base treatment cards within any pack
   Found 52 packs with duplicate base treatment cards (+49 more). Examples: Pack 3: "Pounce" [Normal] (LOF-224); Pack 45: "Fleet Lieutenant" [Normal] (SOR-067)
✅ SOR: common distribution (expect ~9 per pack)
✅ SOR: uncommon distribution (expect ~3 per pack)
✅ SOR: rare/legendary distribution (expect ~1 per pack)

🎁 Testing Sealed Pods (Cross-Pack Duplicates)...
   Duplicates across pod: mean=3.9, σ=2.8, range=[0-11]
   Triplicates across pod: mean=0.0, σ=0.0, range=[0-0]
✅ SOR: duplicate distribution across pods is reasonable
✅ SOR: triplicate distribution across pods is reasonable
✅ SOR: number of 2σ outliers is statistically reasonable
   2σ outliers: #12(11)
✅ SOR: good card variety across all packs
✅ SOR: leaders show good variety

=== 🎴 SHD ===
...

============================
✅ Tests passed: 69
❌ Tests failed: 6
   Warnings: 0

💥 QA FAILED - Issues detected in pack generation
```

## Statistical Methodology

### Understanding the Duplicate Analysis

**Important Terminology:** We only count duplicates of the **same base treatment**:
- Card A (Normal) + Card A (Foil) = ✅ NOT a duplicate
- Card A (Normal) + Card A (Hyperspace) = ✅ NOT a duplicate
- Card A (Normal) + Card A (Normal) = ❌ IS a duplicate

**Key Insight:** Duplicates across a 6-pack sealed pod are **expected and normal**, not a bug!

With ~45 common cards in a set and 54 commons drawn across 6 packs, the birthday paradox guarantees some duplicates.

**What the test measures:**
- Mean duplicates per pod: ~3-4 cards appear twice
- Standard deviation (σ): ~2-3 (normal variation)
- Outliers: Pods significantly above/below mean

**Statistical Validation:**

For normally distributed data:
- **68%** of pods within 1σ of mean
- **95%** of pods within 2σ of mean
- **99.7%** of pods within 3σ of mean

This means:
- ~**5 out of 100 pods** should be 2σ outliers (normal)
- ~**0-1 out of 100 pods** should be 3σ outliers (rare but OK)

**The test validates:**
1. No 3σ outliers (would indicate systematic bias)
2. Number of 2σ outliers ≈ 5 ± 4 (95% confidence interval)
   - 1-2 outliers: ✅ Normal
   - 10-12 outliers: ⚠️ Warning (possible bias)
   - 15+ outliers: ❌ Failure (broken distribution)

**Example interpretation:**
```
Duplicates across pod: mean=3.9, σ=2.8, range=[0-11]
2σ outliers: #12(11)
```
- Average pod has ~4 duplicate cards
- Pod #12 has 11 duplicates (2.5σ above mean)
- Only 1 outlier in 100 pods = perfectly normal!

## Emoji Legend

- 🔄 Loading/Initialization
- 📦 Pack Tests
- 🎯 Belt Tests  
- 🎴 Card/Set Tests
- 🎲 Generation Process
- 🎁 Sealed Pods
- 📊 Statistics/QA
- ✅ Passed Test (Green)
- ❌ Failed Test (Red)
- ⚠️ Warning (Yellow)
- 🎉 Success Banner (Green)
- 💥 Failure Banner (Red)
- 🚀 Test Suite Start
- 🏆 Complete Success
- 👑 Leader Tests
- 💎 Rare/Legendary Tests
- ✨ Foil Tests
- 💫 Hyperfoil Tests
- 🌌 Hyperspace Tests
- 🌟 Showcase Tests
- 🏛️ Base Tests

## Color Coding

- **Green** - Passed tests, success messages
- **Red** - Failed tests, error messages (only when count > 0)
- **Gray** - Zero counts (failed: 0, warnings: 0) for better readability
- **Yellow** - Warnings, error details
- **Blue/Cyan** - Loading, informational messages
- **Purple/Magenta** - Headers, section titles
- **Bold** - Emphasis on final results

**Note:** When there are 0 failures or warnings, they appear in dim gray without emoji icons to improve readability and draw attention only to actual issues.

## Readability Comparison

### ❌ Before (Hard to Read)
```
================================
✅ Tests passed: 24
❌ Tests failed: 0        ← Red X for zero is confusing
⚠️ Warnings: 0            ← Yellow warning for zero is distracting

🎉 ALL TESTS PASSED!
```

### ✅ After (Improved)
```
================================
✅ Tests passed: 24
   Tests failed: 0        ← Gray with no emoji - clearly zero
   Warnings: 0            ← Gray with no emoji - clearly zero

🎉 ALL TESTS PASSED!
```

**Why This Improves Readability:**
- Red/Yellow with emojis only appear when there are actual issues
- Your eye is immediately drawn to problems (non-zero counts)
- Zero counts are present but not visually competing for attention
- Reduces cognitive load when scanning test results