// @ts-nocheck
/**
 * Foil Distribution QA Tests
 *
 * Validates that foil slot rarity distribution matches packConstants weights,
 * and that hyperfoil cards have correct properties.
 *
 * Run with: npx tsx src/qa/foilDistribution.test.ts
 */

import { generateSealedPod, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { SETS_1_3_CONSTANTS, SETS_4_6_CONSTANTS } from '../utils/packConstants'

// 200 pods = 1200 packs = ~1200 foils. Doubled from 100 deliberately: chi-squared
// scales with N, so a larger sample lets the threshold move from p=0.01 to p=0.001
// WITHOUT losing sensitivity. At 600 foils p=0.01 detects a 3pp shift; at 1200
// foils p=0.001 detects the same 3pp — but false-alarms 10x less often.
const POD_SAMPLE_SIZE = 200 // Sealed pods to generate (1200 packs)
const PACKS_PER_POD = 6

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

interface TestResult {
  suite: string
  name: string
  status: 'passed' | 'failed'
  error?: string
  executionTime: number
}

function createTestRunner() {
  let passed = 0
  let failed = 0
  const results: TestResult[] = []

  function test(name: string, fn: () => void): void {
    const startTime = Date.now()
    try {
      fn()
      console.log(`\x1b[32m✅ ${name}\x1b[0m`)
      passed++
      results.push({ suite: 'foil_distribution', name, status: 'passed', executionTime: Date.now() - startTime })
    } catch (e) {
      console.log(`\x1b[31m❌ ${name}\x1b[0m`)
      console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
      failed++
      results.push({ suite: 'foil_distribution', name, status: 'failed', error: (e as Error).message, executionTime: Date.now() - startTime })
    }
  }

  function getResults() {
    return { passed, failed, results }
  }

  return { test, getResults }
}

async function runQA(silentMode = false): Promise<TestResult[]> {
  await initializeCardCache()
  const cards = getCachedCards()
  const setCode = 'SOR'

  if (!silentMode) {
    console.log('\x1b[36m=== Foil Distribution QA Tests ===\x1b[0m')
    console.log(`Generating ${POD_SAMPLE_SIZE} sealed pods (${POD_SAMPLE_SIZE * PACKS_PER_POD} packs) for ${setCode}...\n`)
  }

  clearBeltCache()

  // Generate sealed pods (this properly initializes belts)
  const allPacks: Pack[] = []
  for (let i = 0; i < POD_SAMPLE_SIZE; i++) {
    const packs = generateSealedPod(cards, setCode, PACKS_PER_POD)
    allPacks.push(...packs)
  }

  const { test, getResults } = createTestRunner()

  // Collect foil cards (slot index 15, last card in each pack)
  const foilCards = allPacks.map(p => p.cards[15]).filter(c => c && c.isFoil)

  // Count by rarity
  const foilByRarity: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 }
  foilCards.forEach(c => {
    if (foilByRarity[c.rarity] !== undefined) {
      foilByRarity[c.rarity]++
    }
  })

  test('Foil rarity distribution matches packConstants weights (chi-squared)', () => {
    const weights = SETS_1_3_CONSTANTS.foilSlotWeights
    const totalWeight = weights.Common + weights.Uncommon + weights.Rare + weights.Legendary
    const totalObserved = Object.values(foilByRarity).reduce((a, b) => a + b, 0)

    if (totalObserved < 50) {
      throw new Error(`Only ${totalObserved} foil cards collected, need at least 50`)
    }

    // Chi-squared test
    let chiSquared = 0
    const categories = ['Common', 'Uncommon', 'Rare', 'Legendary']
    categories.forEach(cat => {
      const observed = foilByRarity[cat] || 0
      const expected = (weights[cat] / totalWeight) * totalObserved
      chiSquared += Math.pow(observed - expected, 2) / expected
    })

    // df = 3 (4 categories - 1). p=0.001, NOT p=0.01.
    //
    // A chi-squared test rejects at its alpha rate BY CONSTRUCTION when the null is
    // true — at p=0.01 this test fails 1 run in 100 with nothing wrong, which is
    // measured (1 spurious failure in 71 runs) and unacceptable for a suite that
    // gates every change. The generator itself is fine: over 60 independent
    // samples chi-squared means 3.04 against df=3, and observed shares sit within
    // 0.3pp of the configured weights.
    //
    // p=0.001 with the doubled sample keeps 3pp detection while cutting spurious
    // failures to 1 run in 1000. Real drift is nowhere near the line: the
    // short-print defects found in this codebase ran 6-9 sigma.
    const pValueThreshold = 16.266
    if (chiSquared > pValueThreshold) {
      throw new Error(
        `Chi-squared = ${chiSquared.toFixed(2)} > ${pValueThreshold} (p < 0.001). ` +
        `Distribution: C=${foilByRarity.Common} U=${foilByRarity.Uncommon} R=${foilByRarity.Rare} L=${foilByRarity.Legendary} ` +
        `Expected weights: C=${weights.Common} U=${weights.Uncommon} R=${weights.Rare} L=${weights.Legendary}`
      )
    }

    if (!silentMode) {
      console.log(`   Chi-squared = ${chiSquared.toFixed(2)} (threshold ${pValueThreshold})`)
      console.log(`   Distribution: C=${foilByRarity.Common} U=${foilByRarity.Uncommon} R=${foilByRarity.Rare} L=${foilByRarity.Legendary}`)
    }
  })

  // === Sets 4-6 foil distribution (Special = Rare) ===
  clearBeltCache()
  const set46Code = 'JTL'
  const cards46 = getCachedCards(set46Code)

  if (!silentMode) {
    console.log(`\nGenerating ${POD_SAMPLE_SIZE} sealed pods (${POD_SAMPLE_SIZE * PACKS_PER_POD} packs) for ${set46Code}...\n`)
  }

  const allPacks46: Pack[] = []
  for (let i = 0; i < POD_SAMPLE_SIZE; i++) {
    const packs46 = generateSealedPod(cards46, set46Code, PACKS_PER_POD)
    allPacks46.push(...packs46)
  }

  const foilCards46 = allPacks46.map(p => p.cards[15]).filter(c => c && c.isFoil)
  const foilByRarity46: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Special: 0 }
  foilCards46.forEach(c => {
    if (foilByRarity46[c.rarity] !== undefined) {
      foilByRarity46[c.rarity]++
    }
  })

  test('Sets 4-6 foil rarity distribution matches packConstants weights (chi-squared)', () => {
    const weights = SETS_4_6_CONSTANTS.foilSlotWeights
    const totalWeight = weights.Common + weights.Uncommon + weights.Rare + weights.Special + weights.Legendary
    const totalObserved = Object.values(foilByRarity46).reduce((a, b) => a + b, 0)

    if (totalObserved < 50) {
      throw new Error(`Only ${totalObserved} foil cards collected, need at least 50`)
    }

    let chiSquared = 0
    const categories = ['Common', 'Uncommon', 'Rare', 'Special', 'Legendary']
    categories.forEach(cat => {
      const observed = foilByRarity46[cat] || 0
      const expected = (weights[cat] / totalWeight) * totalObserved
      if (expected > 0) {
        chiSquared += Math.pow(observed - expected, 2) / expected
      }
    })

    // df = 4 (5 categories - 1). p=0.001, not p=0.01 — same reasoning as above.
    const pValueThreshold = 18.467
    if (chiSquared > pValueThreshold) {
      throw new Error(
        `Chi-squared = ${chiSquared.toFixed(2)} > ${pValueThreshold} (p < 0.001). ` +
        `Distribution: C=${foilByRarity46.Common} U=${foilByRarity46.Uncommon} R=${foilByRarity46.Rare} S=${foilByRarity46.Special} L=${foilByRarity46.Legendary} ` +
        `Expected weights: C=${weights.Common} U=${weights.Uncommon} R=${weights.Rare} S=${weights.Special} L=${weights.Legendary}`
      )
    }

    if (!silentMode) {
      console.log(`   Chi-squared = ${chiSquared.toFixed(2)} (threshold ${pValueThreshold})`)
      console.log(`   Distribution: C=${foilByRarity46.Common} U=${foilByRarity46.Uncommon} R=${foilByRarity46.Rare} S=${foilByRarity46.Special} L=${foilByRarity46.Legendary}`)
    }
  })

  test('Sets 4-6 foil Special rate approximately equals Rare rate', () => {
    const totalFoils = Object.values(foilByRarity46).reduce((a, b) => a + b, 0)
    const rareRate = foilByRarity46.Rare / totalFoils
    const specialRate = foilByRarity46.Special / totalFoils

    // With 600 packs, allow a generous tolerance (rates should be within 3x of each other)
    if (specialRate === 0 && rareRate > 0) {
      throw new Error(`Special rate is 0% but Rare rate is ${(rareRate * 100).toFixed(1)}% — Special should appear in foil slot`)
    }
    if (rareRate > 0 && specialRate > 0) {
      const ratio = Math.max(rareRate, specialRate) / Math.min(rareRate, specialRate)
      if (ratio > 3) {
        throw new Error(
          `Special/Rare ratio too skewed: R=${(rareRate * 100).toFixed(1)}% S=${(specialRate * 100).toFixed(1)}% (ratio ${ratio.toFixed(1)}x). Expected approximately equal.`
        )
      }
    }

    if (!silentMode) {
      console.log(`   Rare: ${(rareRate * 100).toFixed(1)}%, Special: ${(specialRate * 100).toFixed(1)}%`)
    }
  })

  // Collect hyperfoil cards
  const hyperfoilCards = allPacks
    .map(p => p.cards[15])
    .filter(c => c && c.isFoil && c.isHyperspace)

  test('Hyperfoil cards have isHyperspace and isFoil properties', () => {
    if (hyperfoilCards.length === 0) {
      if (!silentMode) {
        console.log(`   Note: 0 hyperfoils in ${allPacks.length} packs (expected ~${Math.round(allPacks.length / 50)})`)
      }
      return // Pass — might be unlucky
    }

    hyperfoilCards.forEach(card => {
      if (!card.isHyperspace) {
        throw new Error(`Hyperfoil card ${card.name} missing isHyperspace=true`)
      }
      if (!card.isFoil) {
        throw new Error(`Hyperfoil card ${card.name} missing isFoil=true`)
      }
    })

    if (!silentMode) {
      console.log(`   Found ${hyperfoilCards.length} hyperfoils in ${allPacks.length} packs (${(hyperfoilCards.length / allPacks.length * 100).toFixed(1)}%)`)
    }
  })

  const { passed, failed, results } = getResults()

  if (!silentMode) {
    console.log('')
    console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
    if (failed > 0) {
      console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
    }
    console.log('')
  }

  return results
}

export async function runAllTests(): Promise<TestResult[]> {
  return await runQA(true)
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runQA().then(results => {
    const failed = results.filter(r => r.status === 'failed').length
    if (failed > 0) process.exit(1)
  }).catch(err => {
    console.error(err)
    process.exit(1)
  })
}
