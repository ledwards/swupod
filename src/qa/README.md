# Test Infrastructure

This project has three levels of testing:

## 1. Unit Tests (`npm run test`)

Tests individual components (belts, pack generation) to ensure they work correctly.

### Running Tests

```bash
# Run all tests with summary
npm run test:summary

# Run all tests (verbose)
npm test

# Run only belt tests
npm run test:belts

# Run only utility tests
npm run test:utils

# Run only data validation tests
npm run test:data

# Run booster card count validation
npm run test:booster
```

### Test Output

All tests feature **color-coded output** with emojis for easy reading:
- 🔄 Blue - Loading/initialization
- ✅ Green - Passed tests
- ❌ Red - Failed tests (only shown when count > 0)
- ⚠️ Yellow - Warnings (only shown when count > 0)
- 🎉 Success banner
- 💥 Failure banner
- Gray - Zero counts (for better readability)

**Readability Feature:** When there are 0 failures or warnings, they appear in dim gray without emoji icons. This draws attention only to actual issues.

### Test Files

**Belt Tests** (`src/belts/*.test.js`)
- `BaseBelt.test.js` - Base card belt validation
- `CommonBelt.test.js` - Common card belt validation (Belt A & B)
- `FoilBelt.test.js` - Foil card belt validation
- `HyperfoilBelt.test.js` - Hyperfoil belt validation
- `HyperspaceBelts.test.js` - Hyperspace variant belts validation
- `LeaderBelt.test.js` - Leader card belt validation
- `RareLegendaryBelt.test.js` - Rare/Legendary belt validation
- `ShowcaseLeaderBelt.test.js` - Showcase leader belt validation
- `UncommonBelt.test.js` - Uncommon card belt validation

**Utility Tests** (`src/utils/*.test.js`)
- `boosterPack.test.js` - Pack generation logic validation

**Data Tests** (`src/data/*.test.js`)
- `cards.test.js` - Card data integrity validation
- `boosterCards.test.js` - Booster-eligible card count validation (hardcoded expectations)

## 2. Data Validation Tests (`npm run test:data`)

Validates the card database to ensure data integrity and correct card counts.

### What It Checks

- All cards have required fields (id, name, set, rarity, type)
- All variant types are valid (Normal, Hyperspace, Foil, etc.)
- All rarities are valid (Common, Uncommon, Rare, Legendary, Special)
- No duplicate Normal variant cards exist
- Leaders have `isLeader` flag
- Bases have `isBase` flag
- Foil cards have `isFoil` flag
- Hyperspace cards have `isHyperspace` flag
- Showcase cards have `isShowcase` flag
- All Normal variant cards have image URLs
- Leaders with backText have backImageUrl
- Units have power and hp values
- Non-combat cards have null power and hp

### Running Data Tests

```bash
# General data integrity
npm run test:data

# Booster-eligible card counts (hardcoded expectations)
npm run test:booster
```

## 3. Booster Card Count Validation (`npm run test:booster`)

Validates exact counts of booster-eligible cards with **hardcoded expected values**.

### What It Validates

For each set (SOR, SHD, TWI, JTL, LOF, SEC):

**By Treatment Type:**
- Normal treatment cards
- Foil treatment cards
- Hyperspace treatment cards
- Hyperspace Foil treatment cards
- Showcase cards

**By Card Type (Normal treatment only):**
- Leaders
- Bases
- Commons (non-leader, non-base)
- Uncommons
- Rares (non-leader)
- Legendaries
- Specials

### Booster Eligibility Rules

**Sets 1-3:** Special rarity cards excluded (except Showcase leaders)  
**Sets 4-6:** All cards including Special rarity

### Why Hardcoded Values?

These tests use **hardcoded expected counts** to catch:
- Data import errors
- Missing cards
- Incorrect filtering logic
- Changes to card database that affect pack generation

If these tests fail, the card data has changed and either:
1. The data needs to be fixed, OR
2. The expected values need to be updated (with justification)

### Running Booster Count Tests

```bash
npm run test:booster
```

**Output:** 72 tests (12 per set × 6 sets) validating exact card counts.

## 4. QA Tests (`npm run qa`)

Statistical analysis of pack generation to detect real-world issues.

Results are automatically written to `results.json` and displayed on the `/stats` page (QA tab).

### What It Validates

**Pack Structure**
- All packs have exactly 16 cards
- All packs have exactly 1 leader
- All packs have exactly 1 base
- All packs have exactly 1 foil
- **No duplicate base treatment cards within a single pack** ⚠️

**Rarity Distribution**
- ~9 commons per pack (±15% tolerance)
- ~3 uncommons per pack (±15% tolerance)
- ~1 rare/legendary per pack (±15% tolerance)

**Card Variety**
- No card appears in more than 50% of packs
- Leaders show reasonable variety (at least 3 unique in 100 packs)
- Consecutive packs have good variety (<30% excessive overlap)

**Sealed Pod Validation**
- All sealed pods have 6 packs
- Cross-pod duplicates are expected and statistically validated

**Important:** Different variant treatments of the same card are NOT duplicates:
- Card A (Normal) + Card A (Foil) = ✅ OK
- Card A (Normal) + Card A (Hyperspace) = ✅ OK  
- Card A (Normal) + Card A (Normal) = ❌ Duplicate!

### Running QA Tests

```bash
# Full QA run (verbose, ~1-2 minutes)
npm run qa
```

This will:
1. Generate and test 100 packs per set
2. Run all statistical validations
3. Output results to console (color-coded)
4. Save results to `src/qa/results.json`
5. Results automatically appear on `/stats` page (QA tab)

**Sample Size:** 100 packs per set  
**Tolerance:** 15% for distribution tests  
**Sets Tested:** SOR, SHD, TWI, JTL, LOF, SEC

**Console Output:** Color-coded with emojis:
- 📊 QA header
- 🎴 Set sections
- 🎲 Pack generation status
- 🎁 Sealed pod generation
- ✅/❌ Test results
- ⚠️ Warnings (non-fatal, only shown if > 0)
- Gray text for zero counts (improved readability)

**Results File:** `src/qa/results.json`
- JSON format with test results and summary
- Read by `/stats` page for web display
- Can be committed to git for historical tracking

**Web UI:** Visit `/stats` → QA tab to see:
- Latest test run timestamp
- Total/Passed/Failed summary cards
- Detailed test results with execution times
- Error messages for failed tests

**Statistical Metrics Shown:**
- Mean duplicates/triplicates per sealed pod
- Standard deviation (σ)
- Range [min-max]
- List of 2σ outlier pods (for reference)

### Statistical Outlier Testing

The QA tests validate that the **distribution of outliers** is statistically normal:

**Expected Outlier Rates (for normal distribution):**
- **2σ outliers**: ~5% of samples (5 out of 100 pods)
- **3σ outliers**: ~0.3% of samples (0-1 out of 100 pods)

**Validation Method:**
1. Count pods outside 2σ from the mean
2. Compare to expected 5% using binomial confidence intervals
3. **Warn** if outside 95% confidence interval (unusual but possible)
4. **Fail** if outside 99% confidence interval (very suspicious)

**Example:**
- For 100 pods, expect 5 ± 4.4 outliers (95% CI: [0.6, 9.4])
- Finding 1-2 outliers: ✅ Normal
- Finding 10-12 outliers: ⚠️ Warning (possible systematic bias)
- Finding 15+ outliers: ❌ Failure (likely broken distribution)

This catches issues like:
- Systematic bias in belt logic
- Non-random card selection
- Broken shuffling algorithms

### Known Issues

The QA tests currently **FAIL** due to duplicate base treatment cards appearing within individual packs. 

For example, two copies of "Pounce" (Normal variant) in the same pack is a bug.

However, "Pounce" (Normal) + "Pounce" (Foil) in the same pack is perfectly fine - different treatments don't count as duplicates.

Cross-pod duplicate distribution is working correctly and passes statistical validation.

## Test Framework

All tests use a simple custom test runner with these utilities:

- `test(name, fn)` - Define a test
- `assert(condition, message)` - Assert a condition is true
- `assertEqual(actual, expected, message)` - Assert equality
- `assertWithinTolerance(actual, expected, tolerance, message)` - Assert value within tolerance (QA only)
- `warn(name, message)` - Non-fatal warning (QA only)

Tests are standalone Node.js scripts that can be run directly:

```bash
node src/belts/CommonBelt.test.js
node src/qa/packGeneration.test.js
```

## Adding New Tests

### Unit Test Template

```javascript
/**
 * YourComponent Tests
 *
 * Run with: node src/path/yourComponent.test.js
 */

import { yourFunction } from './yourComponent.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`✗ ${name}`)
    console.log(`  ${e.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

async function runTests() {
  console.log('YourComponent Tests')
  console.log('===================')

  test('does something', () => {
    const result = yourFunction()
    assert(result !== null, 'Result should not be null')
  })

  console.log('')
  console.log('===================')
  console.log(`Tests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  console.log('')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
```

### QA Test Template

See `src/qa/packGeneration.test.js` for an example of statistical validation.

## Quick Start

```bash
# See a quick summary of all test results
npm run test:summary

# Run full QA analysis (takes 1-2 minutes)
npm run qa

# Run specific test suites
npm run test:utils    # Pack generation
npm run test:belts    # All 9 belt tests
npm run test:data     # Card data validation
npm run test:booster  # Booster card counts
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

This allows tests to be used in CI/CD pipelines.

## Test Output Features

- **Color coding** for easy visual scanning
- **Emojis** for test categories and results
- **Summary view** (`test:summary`) for quick overview
- **Verbose output** for detailed debugging
- **Exit codes** for CI/CD integration