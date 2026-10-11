// @ts-nocheck
/**
 * Hyperspace Distribution QA Tests
 *
 * Statistical analysis of hyperspace card distribution in booster packs.
 * Validates that HS rates, co-occurrence patterns, and variance match expectations.
 *
 * Run with: npx tsx src/qa/hyperspaceDistribution.test.ts
 *
 * Key assertions (expected rates DERIVED from HS_BELT_CONFIGS / set configs,
 * bands are ±4 binomial σ for the sample size):
 * - P(>=1 HS) = 1 - Π(1 - r) over the independently-upgrading slots
 * - 2 HS cards per pack is between 1 and 2 sigma from mean
 * - 3+ HS cards per pack is rare but possible
 * - Leader / base HS rates match slotCounts
 * - Set 7+ (LAW, ASH): guaranteed HS common, HSF foil slot, derived mean HS/pack
 *
 * HS leader+base co-occurrence is checked (two-sided, all sets) in
 * printerDistribution.test.ts, not here.
 */

import { generateBoosterPack, generateSealedPod, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { HS_BELT_CONFIGS } from '../utils/packConstants'
import { getSetConfig } from '../utils/setConfigs/index'
import { Set7PlusUc3OutcomeBelt } from '../belts/Set7PlusUc3OutcomeBelt'

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
/** HS belt group — mirrors getHSBeltGroup in boosterPack.ts. */
function hsGroup(setCode: string): string {
  const n = getSetConfig(setCode)!.setNumber
  return n <= 3 ? '1-3' : n <= 6 ? '4-6' : setCode === 'ASH' ? 'ASH' : 'LAW'
}

/** Per-pack HS leader rate: plan rate, pre-empted by the (independent) showcase roll. */
function leaderHsRate(setCode: string): number {
  const cfg = HS_BELT_CONFIGS[hsGroup(setCode)]
  const showcase = getSetConfig(setCode)!.upgradeProbabilities.leaderToShowcase || 0
  return (cfg.slotCounts.leader / cfg.cycleSize) * (1 - showcase)
}
function baseHsRate(setCode: string): number {
  const cfg = HS_BELT_CONFIGS[hsGroup(setCode)]
  return cfg.slotCounts.base / cfg.cycleSize
}

/** ±4 binomial σ for a rate p measured over n trials. */
function band4(p: number, n: number): number {
  return 4 * Math.sqrt(p * (1 - p) / n)
}

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
  // STATISTICAL PACK TESTS (require generating packs)
  // ========================================================================

  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

  for (const setCode of sets) {
    console.log('')
    console.log(`\x1b[1m\x1b[35m=== 🎴 ${setCode} ===\x1b[0m`)

    const cards = getCachedCards(setCode)
    if (cards.length === 0) {
      test(`${setCode}: has card data`, () => { throw new Error(`no card data for ${setCode}`) })
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
    // TEST 1: P(>=1 HS) = 1 - Π(1 - r), derived from config
    // ------------------------------------------------------------------
    // Slots upgrade independently (.claude/rules/belt-system.md, "There Is No
    // Hard Upgrade Cap"): leader (pre-empted by showcase), base, common, uc1,
    // uc2, uc3 from HS_BELT_CONFIGS slotCounts, plus the independent
    // foil→hyperfoil roll from the set config.
    test(`${setCode}: share of packs with ≥1 HS card matches 1 - Π(1 - r)`, () => {
      const cfg = HS_BELT_CONFIGS[hsGroup(setCode)]
      const probs = getSetConfig(setCode)!.upgradeProbabilities
      const rates = [
        leaderHsRate(setCode),
        baseHsRate(setCode),
        cfg.slotCounts.common / cfg.cycleSize,
        cfg.slotCounts.uc1 / cfg.cycleSize,
        cfg.slotCounts.uc2 / cfg.cycleSize,
        cfg.slotCounts.uc3 / cfg.cycleSize,
        probs.foilToHyperfoil || 0,
      ]
      const expected = 1 - rates.reduce((p, r) => p * (1 - r), 1)
      const tol = band4(expected, SAMPLE_SIZE)
      const packsWithHS = hsCounts.filter(c => c >= 1).length
      const rate = packsWithHS / SAMPLE_SIZE

      console.log(`\x1b[36m   Packs with ≥1 HS: ${packsWithHS}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%, expected ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)})\x1b[0m`)
      assert(
        Math.abs(rate - expected) <= tol,
        `≥1 HS share ${(rate * 100).toFixed(1)}% outside ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)}`
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
    // TEST 3: 3 HS cards per pack is rare — but NOT impossible
    // ------------------------------------------------------------------
    // Leader, base and the UC slots upgrade INDEPENDENTLY. Independent events
    // overlap, so a pack with 3 upgrades has to be possible; it is simply
    // unlikely. A hard cap would be the modelling error, not the 3-card pack.
    // Measured ~2.5% for Sets 1-6. The band below keeps it rare without
    // forbidding it.
    test(`${setCode}: 3+ HS cards per pack is rare but possible`, () => {
      const threePlus = hsCounts.filter(c => c >= 3).length / hsCounts.length
      console.log(`\x1b[36m   3+ HS per pack: ${(threePlus * 100).toFixed(2)}% (mean ${mean.toFixed(3)}, σ ${stdDev.toFixed(3)})\x1b[0m`)
      assert(
        threePlus <= 0.08,
        `3+ HS cards in ${(threePlus * 100).toFixed(2)}% of packs — too common, collation variance has blown out`
      )
    })

    // ------------------------------------------------------------------
    // Individual slot HS rates — derived from slotCounts, ±4σ
    // ------------------------------------------------------------------
    test(`${setCode}: leader HS rate matches slotCounts (±4σ)`, () => {
      const hsLeaders = packs.filter(hasHSLeader).length
      const rate = hsLeaders / SAMPLE_SIZE
      const expected = leaderHsRate(setCode)
      const tol = band4(expected, SAMPLE_SIZE)
      console.log(`\x1b[36m   Leader HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)})\x1b[0m`)
      assert(Math.abs(rate - expected) <= tol,
        `Leader HS rate ${(rate * 100).toFixed(1)}% outside ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)}`)
    })

    test(`${setCode}: base HS rate matches slotCounts (±4σ)`, () => {
      const hsBases = packs.filter(hasHSBase).length
      const rate = hsBases / SAMPLE_SIZE
      const expected = baseHsRate(setCode)
      const tol = band4(expected, SAMPLE_SIZE)
      console.log(`\x1b[36m   Base HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)})\x1b[0m`)
      assert(Math.abs(rate - expected) <= tol,
        `Base HS rate ${(rate * 100).toFixed(1)}% outside ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)}`)
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
  for (const SET7 of ['LAW', 'ASH']) {
  console.log('')
  console.log(`\x1b[1m\x1b[35m=== ${SET7} (Set 7+) ===\x1b[0m`)

  const lawCards = getCachedCards(SET7)
  if (lawCards.length === 0) {
    test(`${SET7}: has card data`, () => { throw new Error(`no card data for ${SET7}`) })
  } else {
    console.log(`\x1b[36m🎁 Generating ${SAMPLE_SIZE} ${SET7} packs...\x1b[0m`)
    clearBeltCache()
    const lawPacks: Pack[] = []
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      lawPacks.push(generateBoosterPack(lawCards, SET7))
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

    test(`${SET7}: all packs have 16 cards`, () => {
      const allCorrect = lawPacks.every(p => p.cards.length === 16)
      const badPacks = lawPacks.filter(p => p.cards.length !== 16)
      assert(allCorrect, `${badPacks.length} packs had wrong card count (expected 16)`)
    })

    test(`SPEC: ${SET7} foil slot (pos12, index ${LAW_FOIL_INDEX}) is always present and Hyperspace Foil`, () => {
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

    test(`${SET7}: 100% of packs have ≥1 HS card (not counting HSF)`, () => {
      const packsWithHS = lawHsCounts.filter(c => c >= 1).length
      const rate = packsWithHS / SAMPLE_SIZE
      console.log(`\x1b[36m   Packs with ≥1 HS (excl HSF): ${packsWithHS}/${SAMPLE_SIZE} (${(rate * 100).toFixed(1)}%)\x1b[0m`)
      // Allow small tolerance for variant lookup failures
      assert(rate >= 0.97, `Expected ≥97% of packs to have ≥1 HS (excl HSF), got ${(rate * 100).toFixed(1)}%`)
    })

    test(`SPEC: ${SET7} HS common at common slot 5 (pos7, index ${LAW_HS_COMMON_INDEX}) is 100% guaranteed`, () => {
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
        `${SET7} HS common rate should be ~100%, got ${(rate * 100).toFixed(1)}%`
      )
    })

    test(`SPEC: ${SET7} R/L slot (pos16, index ${LAW_RARE_INDEX}) is NEVER Hyperspace`, () => {
      const violations = lawPacks.filter(p => {
        const rl = p.cards[LAW_RARE_INDEX]
        return rl && (rl.variantType === 'Hyperspace' || rl.isHyperspace === true)
      }).length
      console.log(`\x1b[36m   R/L slot HS violations: ${violations}/${SAMPLE_SIZE} (spec: 0)\x1b[0m`)
      assert(violations === 0,
        `R/L slot must never be Hyperspace (HS rares only via UC3 upgrade), got ${violations}`)
    })

    test(`${SET7}: leader HS rate matches slotCounts (±4σ)`, () => {
      const rate = lawPacks.filter(hasHSLeader).length / SAMPLE_SIZE
      const expected = leaderHsRate(SET7)
      const tol = band4(expected, SAMPLE_SIZE)
      console.log(`\x1b[36m   Leader HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)})\x1b[0m`)
      assert(Math.abs(rate - expected) <= tol,
        `Leader HS rate ${(rate * 100).toFixed(1)}% outside ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)}`)
    })

    test(`${SET7}: base HS rate matches slotCounts (±4σ)`, () => {
      const rate = lawPacks.filter(hasHSBase).length / SAMPLE_SIZE
      const expected = baseHsRate(SET7)
      const tol = band4(expected, SAMPLE_SIZE)
      console.log(`\x1b[36m   Base HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)})\x1b[0m`)
      assert(Math.abs(rate - expected) <= tol,
        `Base HS rate ${(rate * 100).toFixed(1)}% outside ${(expected * 100).toFixed(1)}% ± ${(tol * 100).toFixed(1)}`)
    })

    test(`${SET7}: mean HS per pack (excl HSF) matches the derived sum of slot rates (±4σ)`, () => {
      // DERIVED, not a magic number. Expected HS cards per pack =
      //   1                         guaranteed HS common (packRules.hyperspaceCommonSlot)
      // + leader HS rate            HS_BELT_CONFIGS slotCounts.leader / cycle (× (1 - showcase))
      // + base HS rate              slotCounts.base / cycle
      // + UC3 HS outcomes / 2160    Set7PlusUc3OutcomeBelt cycle (prestige is not HS)
      // + 2 / 48                    CommonUpgradeBelt: 1 Belt-A + 1 Belt-B HS common per 48 packs
      // The HS belt's uc1/uc2/uc3/common counts are NOT used on the Set 7+ path.
      const oc = new Set7PlusUc3OutcomeBelt({ prestigeRate: getSetConfig(SET7)!.upgradeProbabilities.uc3ToPrestige }).outcomeCounts
      const ocTotal = Object.values(oc).reduce((a, b) => a + b, 0)
      const uc3Hs = (oc.hsUncommon + oc.hsRare + oc.hsSpecial + oc.hsLegendary) / ocTotal
      const expected = 1 + leaderHsRate(SET7) + baseHsRate(SET7) + uc3Hs + 2 / 48
      // σ of the mean: the guaranteed common contributes no variance; the rest
      // are (at most) independent Bernoullis.
      const variance = [leaderHsRate(SET7), baseHsRate(SET7), uc3Hs, 2 / 48].reduce((v, p) => v + p * (1 - p), 0)
      const tol = 4 * Math.sqrt(variance / SAMPLE_SIZE)
      console.log(`\x1b[36m   Mean HS per pack (excl HSF): ${lawStats.mean.toFixed(3)} (expected ${expected.toFixed(3)} ± ${tol.toFixed(3)})\x1b[0m`)
      assert(Math.abs(lawStats.mean - expected) <= tol,
        `Mean HS per pack ${lawStats.mean.toFixed(3)} outside ${expected.toFixed(3)} ± ${tol.toFixed(3)}`)
    })
  }
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
