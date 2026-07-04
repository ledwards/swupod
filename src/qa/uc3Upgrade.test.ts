// @ts-nocheck
/**
 * UC3 Upgrade QA Tests
 *
 * Validates that the UC3 slot (index 13) upgrades at the correct rate
 * and produces the correct rarity distribution per set group spec.
 *
 * Specs (from packConstants.ts):
 *   Sets 1-3: upgrade rate ~1/5.5, weights UC:64 R:31 L:5
 *   Sets 4-6: upgrade rate ~1/5,   weights UC:60 R:25 S:10 L:5
 *   LAW (7+): upgrade rate ~1/3,   weights UC:24 R:12 S:3  L:1
 *             + prestige at 1/18 (checked first)
 *
 * Run with: npx tsx src/qa/uc3Upgrade.test.ts
 */

import { generateBoosterPack, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache } from '../utils/cardCache'
import {
  SETS_1_3_CONSTANTS,
  SETS_4_6_CONSTANTS,
  SET_7_PLUS_CONSTANTS,
  HS_BELT_CONFIGS,
} from '../utils/packConstants'

const PACK_COUNT = 600  // packs per set

let passed = 0
let failed = 0

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

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

interface UC3Stats {
  total: number
  upgraded: number
  byRarity: Record<string, number>
  prestige: number
}

let uc3SlotIndex = -1

function collectUC3Stats(setCode: string, count: number): UC3Stats {
  clearBeltCache()
  uc3SlotIndex = -1  // Reset for each set
  const stats: UC3Stats = { total: count, upgraded: 0, byRarity: {}, prestige: 0 }

  // Determine UC3 slot index: generate one pack and find the 3rd uncommon position
  // This position is fixed per set (pack assembly is deterministic before upgrades)
  if (uc3SlotIndex === -1) {
    const probe = generateBoosterPack([], setCode)
    let ucCount = 0
    for (let idx = 0; idx < probe.cards.length; idx++) {
      const c = probe.cards[idx]
      if (c.rarity === 'Uncommon' && !c.isLeader && !c.isBase && !c.isFoil) {
        ucCount++
        if (ucCount === 3) { uc3SlotIndex = idx; break }
      }
    }
    // If upgrade happened in probe pack, try more packs
    if (uc3SlotIndex === -1) {
      // Fallback: UC3 is the slot just before the R/L slot
      const rlIdx = probe.cards.findIndex(c => (c.rarity === 'Rare' || c.rarity === 'Legendary') && !c.isFoil && !c.isLeader && !c.isBase)
      uc3SlotIndex = rlIdx > 0 ? rlIdx - 1 : 14
    }
    console.log(`\x1b[36m   UC3 slot index for ${setCode}: ${uc3SlotIndex}\x1b[0m`)
  }

  for (let i = 0; i < count; i++) {
    const pack = generateBoosterPack([], setCode)
    const uc3Card = pack.cards[uc3SlotIndex]

    // Check if UC3 was upgraded
    const isHyperspace = uc3Card.isHyperspace === true || uc3Card.variantType === 'Hyperspace'
    const isPrestige = uc3Card.prestigeTier != null

    if (isHyperspace || isPrestige) {
      stats.upgraded++

      if (isPrestige) {
        stats.prestige++
      } else {
        const rarity = uc3Card.rarity || 'Unknown'
        stats.byRarity[rarity] = (stats.byRarity[rarity] || 0) + 1
      }
    }
  }

  return stats
}

/**
 * Z-score test: is the observed rate within acceptable variance of expected?
 * Uses binomial standard deviation: σ = sqrt(n * p * (1-p))
 */
function zScoreCheck(observed: number, n: number, expectedRate: number, label: string, warnZ = 2.5, failZ = 4): void {
  const expected = n * expectedRate
  const stdDev = Math.sqrt(n * expectedRate * (1 - expectedRate))
  const z = stdDev > 0 ? (observed - expected) / stdDev : 0
  console.log(`\x1b[36m   ${label}: ${observed}/${n} = ${(observed/n*100).toFixed(1)}% (expected ${(expectedRate*100).toFixed(1)}%, z=${z.toFixed(2)})\x1b[0m`)
  if (Math.abs(z) > failZ) {
    throw new Error(`${label}: z-score ${z.toFixed(2)} exceeds fail threshold ${failZ} (observed ${observed}/${n} = ${(observed/n*100).toFixed(1)}%, expected ${(expectedRate*100).toFixed(1)}%)`)
  }
  if (Math.abs(z) > warnZ) {
    console.log(`\x1b[33m   ⚠️  Warning: z-score ${z.toFixed(2)} exceeds warn threshold ${warnZ}\x1b[0m`)
  }
}

async function runTests() {
  console.log('\x1b[1m\x1b[36m📊 UC3 Upgrade QA\x1b[0m')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[36m📦 Sample size: ${PACK_COUNT} packs per set\x1b[0m`)
  console.log('')

  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()

  // =========================================================================
  // Sets 1-3: SOR
  // Spec: upgrade rate ~1/5.5, weights UC:64 R:31 L:5 (no Special)
  // =========================================================================
  console.log('')
  console.log('\x1b[1m\x1b[35mSets 1-3 (SOR)\x1b[0m')

  const sorStats = collectUC3Stats('SOR', PACK_COUNT)
  const spec13 = SETS_1_3_CONSTANTS
  const beltConfig13 = HS_BELT_CONFIGS['1-3']
  const rate13 = beltConfig13.slotCounts.uc3 / beltConfig13.cycleSize  // 8/60 = 13.3% (belt-driven)
  const weights13 = spec13.ucSlot3UpgradedWeights
  const totalWeight13 = Object.values(weights13).reduce((a, b) => a + b, 0)

  test('SOR: UC3 upgrade rate matches belt config (8/60 = 13.3%)', () => {
    zScoreCheck(sorStats.upgraded, PACK_COUNT, rate13, 'UC3 upgrade rate')
  })

  if (sorStats.upgraded > 0) {
    const hsOnly13 = sorStats.upgraded - sorStats.prestige
    test('SOR: UC3 upgraded rarity — Uncommon rate matches spec (64%)', () => {
      const ucCount = sorStats.byRarity['Uncommon'] || 0
      const expectedRate = weights13.Uncommon / totalWeight13
      zScoreCheck(ucCount, hsOnly13, expectedRate, 'UC HS rate')
    })

    test('SOR: UC3 upgraded rarity — Rare rate matches spec (31%)', () => {
      const rCount = sorStats.byRarity['Rare'] || 0
      const expectedRate = weights13.Rare / totalWeight13
      zScoreCheck(rCount, hsOnly13, expectedRate, 'R HS rate')
    })

    test('SOR: UC3 upgraded rarity — Legendary rate matches spec (5%)', () => {
      const lCount = sorStats.byRarity['Legendary'] || 0
      const expectedRate = weights13.Legendary / totalWeight13
      zScoreCheck(lCount, hsOnly13, expectedRate, 'L HS rate')
    })

    test('SOR: UC3 upgraded rarity — no Special (sets 1-3 have no Special)', () => {
      const sCount = sorStats.byRarity['Special'] || 0
      assert(sCount === 0, `Expected 0 Special, got ${sCount}`)
    })
  }

  // =========================================================================
  // Sets 4-6: JTL
  // Spec: upgrade rate ~1/5, weights UC:60 R:25 S:10 L:5
  // =========================================================================
  console.log('')
  console.log('\x1b[1m\x1b[35mSets 4-6 (JTL)\x1b[0m')

  const jtlStats = collectUC3Stats('JTL', PACK_COUNT)
  const spec46 = SETS_4_6_CONSTANTS
  const beltConfig46 = HS_BELT_CONFIGS['4-6']
  const rate46 = beltConfig46.slotCounts.uc3 / beltConfig46.cycleSize  // 8/60 = 13.3% (belt-driven)
  const weights46 = spec46.ucSlot3UpgradedWeights
  const totalWeight46 = Object.values(weights46).reduce((a, b) => a + b, 0)

  test('JTL: UC3 upgrade rate matches belt config (8/60 = 13.3%)', () => {
    zScoreCheck(jtlStats.upgraded, PACK_COUNT, rate46, 'UC3 upgrade rate')
  })

  if (jtlStats.upgraded > 0) {
    const hsOnly46 = jtlStats.upgraded - jtlStats.prestige
    test('JTL: UC3 upgraded rarity — Uncommon rate matches spec (60%)', () => {
      const ucCount = jtlStats.byRarity['Uncommon'] || 0
      const expectedRate = weights46.Uncommon / totalWeight46
      zScoreCheck(ucCount, hsOnly46, expectedRate, 'UC HS rate')
    })

    test('JTL: UC3 upgraded rarity — Rare rate matches spec (25%)', () => {
      const rCount = jtlStats.byRarity['Rare'] || 0
      const expectedRate = weights46.Rare / totalWeight46
      zScoreCheck(rCount, hsOnly46, expectedRate, 'R HS rate')
    })

    test('JTL: UC3 upgraded rarity — Special rate matches spec (10%)', () => {
      const sCount = jtlStats.byRarity['Special'] || 0
      const expectedRate = weights46.Special / totalWeight46
      zScoreCheck(sCount, hsOnly46, expectedRate, 'S HS rate')
    })

    test('JTL: UC3 upgraded rarity — Legendary rate matches spec (5%)', () => {
      const lCount = jtlStats.byRarity['Legendary'] || 0
      const expectedRate = weights46.Legendary / totalWeight46
      zScoreCheck(lCount, hsOnly46, expectedRate, 'L HS rate')
    })
  }

  // =========================================================================
  // Set 7+: LAW
  // Spec: prestige 1/18, HS upgrade 1/3 (post-prestige), weights UC:24 R:12 S:3 L:1
  // Combined upgrade rate = 1/18 + 17/18 × 1/3 = 20/54 ≈ 37%
  // =========================================================================
  console.log('')
  console.log('\x1b[1m\x1b[35mSet 7+ (LAW)\x1b[0m')

  const lawStats = collectUC3Stats('LAW', PACK_COUNT)
  const spec7 = SET_7_PLUS_CONSTANTS
  const prestigeRate = spec7.uc3PrestigeRate  // 1/18
  const hsRate7 = spec7.ucSlot3UpgradeRate    // 1/3
  const weights7 = spec7.ucSlot3UpgradedWeights
  const totalWeight7 = Object.values(weights7).reduce((a, b) => a + b, 0)
  // Combined: prestige + (1-prestige) × hsRate
  const combinedUpgradeRate = prestigeRate + (1 - prestigeRate) * hsRate7

  test('LAW: UC3 total upgrade rate matches spec (~37%)', () => {
    zScoreCheck(lawStats.upgraded, PACK_COUNT, combinedUpgradeRate, 'UC3 total upgrade rate')
  })

  test('LAW: UC3 prestige rate matches spec (~1/18 = 5.6%)', () => {
    zScoreCheck(lawStats.prestige, PACK_COUNT, prestigeRate, 'Prestige rate')
  })

  const hsOnly7 = lawStats.upgraded - lawStats.prestige
  // HS-only rate: (1 - prestigeRate) × hsRate
  const hsOnlyRate = (1 - prestigeRate) * hsRate7
  test('LAW: UC3 HS-only upgrade rate matches spec (~31.5%)', () => {
    zScoreCheck(hsOnly7, PACK_COUNT, hsOnlyRate, 'HS-only upgrade rate')
  })

  if (hsOnly7 > 0) {
    test('LAW: UC3 upgraded rarity — Uncommon rate matches spec (60%)', () => {
      const ucCount = lawStats.byRarity['Uncommon'] || 0
      const expectedRate = weights7.Uncommon / totalWeight7
      zScoreCheck(ucCount, hsOnly7, expectedRate, 'UC HS rate')
    })

    test('LAW: UC3 upgraded rarity — Rare rate matches spec (30%)', () => {
      const rCount = lawStats.byRarity['Rare'] || 0
      const expectedRate = weights7.Rare / totalWeight7
      zScoreCheck(rCount, hsOnly7, expectedRate, 'R HS rate')
    })

    test('LAW: UC3 upgraded rarity — Special rate matches spec (7.5%)', () => {
      const sCount = lawStats.byRarity['Special'] || 0
      const expectedRate = weights7.Special / totalWeight7
      zScoreCheck(sCount, hsOnly7, expectedRate, 'S HS rate')
    })

    test('LAW: UC3 upgraded rarity — Legendary rate matches spec (2.5%)', () => {
      const lCount = lawStats.byRarity['Legendary'] || 0
      const expectedRate = weights7.Legendary / totalWeight7
      zScoreCheck(lCount, hsOnly7, expectedRate, 'L HS rate')
    })
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }

  if (failed > 0) process.exit(1)
}

runTests().catch(err => {
  console.error('UC3 Upgrade QA failed:', err)
  process.exit(1)
})
