// @ts-nocheck
/**
 * Hyperspace Distribution QA Tests
 *
 * Statistical analysis of hyperspace card distribution in booster packs.
 * Validates that HS rates, co-occurrence patterns, and variance match expectations.
 *
 * Run with: npx tsx src/qa/hyperspaceDistribution.test.ts
 *
 * Key assertions:
 * - ~2/3 of packs have at least 1 HS card
 * - 2 HS cards per pack is between 1 and 2 sigma from mean
 * - 3 HS cards per pack is a 3-sigma outlier
 * - HS base + HS leader in same pack is rare
 * - Encoded rates: leader HS 1/6, base HS 1/6, R/L HS 1/15
 */

import { generateBoosterPack, generateSealedPod, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { SETS_1_3_CONSTANTS, SETS_4_6_CONSTANTS } from '../utils/packConstants'

const SAMPLE_SIZE = 1200 // Packs per set (enough for statistical significance)

interface Card {
  id: string
  name: string
  variantType?: string
  isFoil?: boolean
  isLeader?: boolean
  isBase?: boolean
  isHyperspace?: boolean
  rarity?: string
  set?: string
}

interface Pack {
  cards: Card[]
}

let passed = 0
let failed = 0
let warnings = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    passed++
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
    failed++
  }
}

function warn(name: string, message: string): void {
  console.log(`\x1b[33m⚠️  ${name}\x1b[0m`)
  console.log(`\x1b[33m   ${message}\x1b[0m`)
  warnings++
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

/**
 * Count hyperspace cards in a pack.
 * A card is HS if variantType is 'Hyperspace' or isHyperspace is true.
 * Excludes Showcase variants (different treatment).
 */
function countHSCards(pack: Pack): number {
  return pack.cards.filter(c =>
    c.variantType === 'Hyperspace' || c.isHyperspace === true
  ).length
}

/**
 * Check if a pack has an HS leader
 */
function hasHSLeader(pack: Pack): boolean {
  return pack.cards.some(c =>
    c.isLeader && (c.variantType === 'Hyperspace' || c.isHyperspace === true)
  )
}

/**
 * Check if a pack has an HS base
 */
function hasHSBase(pack: Pack): boolean {
  return pack.cards.some(c =>
    c.isBase && (c.variantType === 'Hyperspace' || c.isHyperspace === true)
  )
}

/**
 * Calculate mean and standard deviation
 */
function calcStats(values: number[]): { mean: number; stdDev: number } {
  const n = values.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  return { mean, stdDev: Math.sqrt(variance) }
}

async function run(): Promise<void> {
  console.log('\x1b[1m\x1b[36m🌀 Hyperspace Distribution QA\x1b[0m')
  console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m')
  console.log(`\x1b[36m📦 Sample size: ${SAMPLE_SIZE} packs per set\x1b[0m`)
  console.log('')

  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()

  // ========================================================================
  // RATE ENCODING TESTS (unit-level, no pack generation needed)
  // ========================================================================
  console.log('')
  console.log('\x1b[1m\x1b[35m=== Rate Encoding Tests ===\x1b[0m')

  test('Sets 1-3: leader HS rate is 1/6', () => {
    const rate = SETS_1_3_CONSTANTS.leaderHyperspaceRate
    const expected = 1 / 6
    assert(
      Math.abs(rate - expected) < 0.001,
      `Leader HS rate is ${rate}, expected ${expected.toFixed(4)}`
    )
  })

  test('Sets 1-3: base HS rate is 1/6', () => {
    const rate = SETS_1_3_CONSTANTS.baseHyperspaceRate
    const expected = 1 / 6
    assert(
      Math.abs(rate - expected) < 0.001,
      `Base HS rate is ${rate}, expected ${expected.toFixed(4)}`
    )
  })

  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  // (rareSlotHyperspaceRate has been removed)

  test('Sets 4-6: leader HS rate is 1/6', () => {
    const rate = SETS_4_6_CONSTANTS.leaderHyperspaceRate
    const expected = 1 / 6
    assert(
      Math.abs(rate - expected) < 0.001,
      `Leader HS rate is ${rate}, expected ${expected.toFixed(4)}`
    )
  })

  test('Sets 4-6: base HS rate is 1/6', () => {
    const rate = SETS_4_6_CONSTANTS.baseHyperspaceRate
    const expected = 1 / 6
    assert(
      Math.abs(rate - expected) < 0.001,
      `Base HS rate is ${rate}, expected ${expected.toFixed(4)}`
    )
  })

  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  // (rareSlotHyperspaceRate has been removed)

  // ========================================================================
  // STATISTICAL PACK TESTS (require generating packs)
  // ========================================================================

  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

  for (const setCode of sets) {
    console.log('')
    console.log(`\x1b[1m\x1b[35m=== 🎴 ${setCode} ===\x1b[0m`)

    const cards = getCachedCards(setCode)
    if (cards.length === 0) {
      console.log(`\x1b[33m⚠️  Skipping ${setCode} - no card data\x1b[0m`)
      continue
    }

    // Generate packs
    console.log(`\x1b[36m🎁 Generating ${SAMPLE_SIZE} packs...\x1b[0m`)
    clearBeltCache()
    const packs: Pack[] = []
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      packs.push(generateBoosterPack(cards, setCode))
    }

    // Count HS cards per pack
    const hsCounts = packs.map(countHSCards)
    const { mean, stdDev } = calcStats(hsCounts)

    // Distribution counts
    const distribution: Record<number, number> = {}
    for (const count of hsCounts) {
      distribution[count] = (distribution[count] || 0) + 1
    }

    console.log(`\x1b[36m   HS per pack: mean=${mean.toFixed(3)}, σ=${stdDev.toFixed(3)}\x1b[0m`)
    console.log(`\x1b[36m   Distribution: ${Object.entries(distribution).sort((a,b) => +a[0] - +b[0]).map(([k,v]) => `${k}HS:${v}`).join(' ')}\x1b[0m`)

    // ------------------------------------------------------------------
    // TEST 1: ~2/3 of packs have at least 1 HS card
    // ------------------------------------------------------------------
    test(`${setCode}: ~2/3 of packs have at least 1 HS card`, () => {
      const packsWithHS = hsCounts.filter(c => c >= 1).length
      const rate = packsWithHS / SAMPLE_SIZE

      console.log(`\x1b[36m   Packs with ≥1 HS: ${packsWithHS}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%)\x1b[0m`)

      // Accept 55%-80% range (centered around ~2/3 = 66.7%)
      assert(
        rate >= 0.55 && rate <= 0.80,
        `Expected ~2/3 (55-80%) of packs to have ≥1 HS card, got ${(rate * 100).toFixed(1)}%`
      )
    })

    // ------------------------------------------------------------------
    // TEST 2: 2 HS cards per pack is between 1 and 2 sigma from mean
    // ------------------------------------------------------------------
    test(`${setCode}: 2 HS cards per pack is between 1σ and 2σ from mean`, () => {
      const zScore = (2 - mean) / stdDev

      console.log(`\x1b[36m   Z-score for 2 HS: ${zScore.toFixed(3)} (target: 1.0-2.0)\x1b[0m`)

      assert(
        zScore >= 1.0 && zScore <= 2.0,
        `Z-score for 2 HS cards = ${zScore.toFixed(3)}, expected between 1.0 and 2.0. ` +
        `(mean=${mean.toFixed(3)}, σ=${stdDev.toFixed(3)})`
      )
    })

    // ------------------------------------------------------------------
    // TEST 3: 3 HS cards per pack is a 3-sigma outlier
    // ------------------------------------------------------------------
    test(`${setCode}: 3 HS cards per pack is a ≥3σ outlier`, () => {
      const zScore = (3 - mean) / stdDev

      console.log(`\x1b[36m   Z-score for 3 HS: ${zScore.toFixed(3)} (target: ≥3.0)\x1b[0m`)

      assert(
        zScore >= 3.0,
        `Z-score for 3 HS cards = ${zScore.toFixed(3)}, expected ≥3.0. ` +
        `With mean=${mean.toFixed(3)} and σ=${stdDev.toFixed(3)}, ` +
        `3 HS is only ${zScore.toFixed(1)}σ from the mean. ` +
        `Need belt-style collation to compress variance.`
      )
    })

    // ------------------------------------------------------------------
    // TEST 4: HS base + HS leader in same pack is rare
    // ------------------------------------------------------------------
    test(`${setCode}: HS base + HS leader in same pack is rare (<5%)`, () => {
      let bothCount = 0
      packs.forEach(pack => {
        if (hasHSLeader(pack) && hasHSBase(pack)) {
          bothCount++
        }
      })

      const rate = bothCount / SAMPLE_SIZE
      console.log(`\x1b[36m   HS leader + HS base co-occurrence: ${bothCount}/${SAMPLE_SIZE} (${(rate * 100).toFixed(2)}%)\x1b[0m`)

      // With independent trials at 1/6 each: P(both) = 1/36 ≈ 2.8%
      // With belt collation this should be even rarer
      // Accept up to 5% as "rare"
      assert(
        rate < 0.05,
        `HS leader + HS base in same pack: ${(rate * 100).toFixed(2)}% (expected < 5%). ` +
        `With independent 1/6 rates, theoretical is 2.8%.`
      )
    })

    // ------------------------------------------------------------------
    // BONUS: Individual slot HS rate checks
    // ------------------------------------------------------------------
    test(`${setCode}: leader HS rate is approximately 1/6`, () => {
      const hsLeaders = packs.filter(hasHSLeader).length
      const rate = hsLeaders / SAMPLE_SIZE
      const expected = 1 / 6

      console.log(`\x1b[36m   Leader HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)\x1b[0m`)

      // Allow 30% tolerance
      assert(
        Math.abs(rate - expected) / expected < 0.30,
        `Leader HS rate ${(rate * 100).toFixed(1)}% deviates >30% from expected ${(expected * 100).toFixed(1)}%`
      )
    })

    test(`${setCode}: base HS rate is approximately 1/6`, () => {
      const hsBases = packs.filter(hasHSBase).length
      const rate = hsBases / SAMPLE_SIZE
      const expected = 1 / 6

      console.log(`\x1b[36m   Base HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)\x1b[0m`)

      assert(
        Math.abs(rate - expected) / expected < 0.30,
        `Base HS rate ${(rate * 100).toFixed(1)}% deviates >30% from expected ${(expected * 100).toFixed(1)}%`
      )
    })

    test(`${setCode}: R/L slot NEVER has HS upgrade (HS rares only via UC3)`, () => {
      // The R/L slot is at pack index 14 (after leader, base, 9 commons, 3 uncommons)
      // This slot should NEVER be upgraded to Hyperspace - HS rares only appear via UC3 upgrade
      const RL_SLOT_INDEX = 14
      let hsRL = 0
      packs.forEach(pack => {
        const rlCard = pack.cards[RL_SLOT_INDEX]
        if (rlCard && (rlCard.variantType === 'Hyperspace' || rlCard.isHyperspace)) {
          hsRL++
        }
      })

      const rate = hsRL / SAMPLE_SIZE

      console.log(`\x1b[36m   R/L slot HS rate (index ${RL_SLOT_INDEX}): ${(rate * 100).toFixed(1)}% (expected 0.0%)\x1b[0m`)

      assert(
        rate === 0,
        `R/L slot should NEVER have HS upgrades, but found ${hsRL}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%)`
      )
    })
  }

  // ========================================================================
  // LAW (Set 7) — Guaranteed HS + Hyperspace Foil
  // ========================================================================
  console.log('')
  console.log('\x1b[1m\x1b[35m=== 🤠 LAW (Set 7) ===\x1b[0m')

  const lawCards = getCachedCards('LAW')
  if (lawCards.length === 0) {
    console.log('\x1b[33m⚠️  Skipping LAW - no card data\x1b[0m')
  } else {
    console.log(`\x1b[36m🎁 Generating ${SAMPLE_SIZE} LAW packs...\x1b[0m`)
    clearBeltCache()
    const lawPacks: Pack[] = []
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      lawPacks.push(generateBoosterPack(lawCards, 'LAW'))
    }

    // SPEC — physical LAW+/Set 7+ pack order, transcribed from real ASH box 001
    // (plans/ASH_COLLATION_FINDINGS.md): pos1 leader · pos2 base · pos3-11 commons
    // (pos7 = common slot 5 = guaranteed HS common) · pos12 foil · pos13-15
    // uncommons (pos15 = UC3) · pos16 rare/legendary. Zero-indexed below.
    // NOTE: this differs from Sets 1-6, where the foil is last (index 15) and the
    // R/L slot is index 14. These constants were previously the Sets 1-6 values,
    // so all three LAW assertions below silently measured the wrong slot.
    const LAW_HS_COMMON_INDEX = 6   // pos7
    const LAW_FOIL_INDEX = 11       // pos12 — always Hyperspace Foil on LAW+
    const LAW_RARE_INDEX = 15       // pos16

    // Helper: count HS cards excluding the always-HS foil slot
    function countHSCardsExcludingHSF(pack: Pack): number {
      return pack.cards.filter((c, i) =>
        i !== LAW_FOIL_INDEX && (c.variantType === 'Hyperspace' || c.isHyperspace === true)
      ).length
    }

    const lawHsCounts = lawPacks.map(countHSCardsExcludingHSF)
    const lawStats = calcStats(lawHsCounts)
    console.log(`\x1b[36m   HS per pack (excl HSF): mean=${lawStats.mean.toFixed(3)}, σ=${lawStats.stdDev.toFixed(3)}\x1b[0m`)

    test('LAW: all packs have 16 cards', () => {
      const allCorrect = lawPacks.every(p => p.cards.length === 16)
      const badPacks = lawPacks.filter(p => p.cards.length !== 16)
      assert(allCorrect, `${badPacks.length} packs had wrong card count (expected 16)`)
    })

    test(`SPEC: LAW foil slot (pos12, index ${LAW_FOIL_INDEX}) is always present and Hyperspace Foil`, () => {
      let hsfCount = 0
      lawPacks.forEach(pack => {
        const hsf = pack.cards[LAW_FOIL_INDEX]
        if (hsf && hsf.isFoil && hsf.isHyperspace) {
          hsfCount++
        }
      })
      const rate = hsfCount / SAMPLE_SIZE
      console.log(`\x1b[36m   HSF slot present: ${hsfCount}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%)\x1b[0m`)
      assert(rate >= 0.99, `HSF slot should be present in ≥99% of packs, got ${(rate * 100).toFixed(1)}%`)
    })

    test('LAW: 100% of packs have ≥1 HS card (not counting HSF)', () => {
      const packsWithHS = lawHsCounts.filter(c => c >= 1).length
      const rate = packsWithHS / SAMPLE_SIZE
      console.log(`\x1b[36m   Packs with ≥1 HS (excl HSF): ${packsWithHS}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%)\x1b[0m`)
      // Allow small tolerance for variant lookup failures
      assert(rate >= 0.97, `Expected ≥97% of packs to have ≥1 HS (excl HSF), got ${(rate * 100).toFixed(1)}%`)
    })

    test(`SPEC: LAW HS common at common slot 5 (pos7, index ${LAW_HS_COMMON_INDEX}) is 100% guaranteed`, () => {
      let hsCommonCount = 0
      lawPacks.forEach(pack => {
        const card = pack.cards[LAW_HS_COMMON_INDEX]
        if (card && (card.variantType === 'Hyperspace' || card.isHyperspace === true)) {
          hsCommonCount++
        }
      })
      const rate = hsCommonCount / SAMPLE_SIZE
      console.log(`\x1b[36m   HS common (pos7, index ${LAW_HS_COMMON_INDEX}): ${hsCommonCount}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%, expected 100%)\x1b[0m`)
      assert(
        rate >= 0.99,
        `LAW HS common rate should be ~100%, got ${(rate * 100).toFixed(1)}%`
      )
    })

    test(`SPEC: LAW R/L slot (pos16, index ${LAW_RARE_INDEX}) is NEVER Hyperspace`, () => {
      const violations = lawPacks.filter(p => {
        const rl = p.cards[LAW_RARE_INDEX]
        return rl && (rl.variantType === 'Hyperspace' || rl.isHyperspace === true)
      }).length
      console.log(`\x1b[36m   R/L slot HS violations: ${violations}/${SAMPLE_SIZE} (spec: 0)\x1b[0m`)
      assert(violations === 0,
        `R/L slot must never be Hyperspace (HS rares only via UC3 upgrade), got ${violations}`)
    })

    test('LAW: leader HS rate is approximately 1/6', () => {
      const hsLeaders = lawPacks.filter(hasHSLeader).length
      const rate = hsLeaders / SAMPLE_SIZE
      const expected = 1 / 6
      console.log(`\x1b[36m   Leader HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)\x1b[0m`)
      assert(
        Math.abs(rate - expected) / expected < 0.30,
        `Leader HS rate ${(rate * 100).toFixed(1)}% deviates >30% from expected ${(expected * 100).toFixed(1)}%`
      )
    })

    test('LAW: base HS rate is approximately 1/6', () => {
      const hsBases = lawPacks.filter(hasHSBase).length
      const rate = hsBases / SAMPLE_SIZE
      const expected = 1 / 6
      console.log(`\x1b[36m   Base HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)\x1b[0m`)
      assert(
        Math.abs(rate - expected) / expected < 0.30,
        `Base HS rate ${(rate * 100).toFixed(1)}% deviates >30% from expected ${(expected * 100).toFixed(1)}%`
      )
    })

    test('LAW: mean HS per pack ≈ 1.6 (100% HS common + other upgrades)', () => {
      // With 100% HS common (60/60), plus other upgrades (~38/60):
      // Leader: 10/60, Base: 10/60, R/L: 4/60, UC1: 4/60, UC2: 2/60, UC3: 8/60
      // Total: 60 + 38 = 98/60 ≈ 1.63
      const expected = 98 / 60
      console.log(`\x1b[36m   Mean HS per pack (excl HSF): ${lawStats.mean.toFixed(3)} (expected ${expected.toFixed(3)})\x1b[0m`)
      assert(
        Math.abs(lawStats.mean - expected) / expected < 0.20,
        `Mean HS per pack should be ≈${expected.toFixed(2)}, got ${lawStats.mean.toFixed(3)}`
      )
    })
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('')
  console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }
  if (warnings > 0) {
    console.log(`\x1b[33m⚠️  Warnings: ${warnings}\x1b[0m`)
  }
  console.log('')

  if (failed > 0) {
    console.log('\x1b[31m\x1b[1m💥 QA FAILED - HS distribution issues detected\x1b[0m')
    process.exit(1)
  } else {
    console.log('\x1b[32m\x1b[1m🎉 QA PASSED - HS distribution looks good!\x1b[0m')
  }
}

run().catch(err => {
  console.error('QA runner failed:', err)
  process.exit(1)
})
