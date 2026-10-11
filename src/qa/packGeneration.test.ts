// @ts-nocheck
/**
 * Pack Generation QA Tests
 *
 * Statistical analysis of pack generation to detect anomalies.
 * Generates a large sample of sealed pods and validates distribution.
 *
 * Run with: npx tsx src/qa/packGeneration.test.ts
 * Or: npm run qa
 *
 * Results are written to: src/qa/results.json
 */

import { generateBoosterPack, generateSealedPod, generateSealedBox, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { getSetConfig } from '../utils/setConfigs/index'
import { LeaderBelt } from '../belts/LeaderBelt'
import { HyperspaceLeaderBelt } from '../belts/HyperspaceLeaderBelt'
import { ShowcaseLeaderBelt } from '../belts/ShowcaseLeaderBelt'
import { LEADER_COMMON_PRINTS_PER_BOOT, LEADER_DEDUP_WINDOW } from '../belts/leaderSheet'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const POD_SAMPLE_SIZE = 100 // Number of sealed pods to generate for analysis
const PACKS_PER_POD = 6
const TOLERANCE = 0.15 // 15% tolerance for statistical tests
const LEADER_QA_SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'ASH']
const LEADER_BOX_QA_SET = 'ASH'
const LEADER_BOX_QA_SAMPLE_SIZE = 1000
const DRAFT_BOX_SIZE = 24
const PACK_QA_SEED_BASE = 0x9a5eed00

interface TestResult {
  suite: string
  name: string
  status: 'passed' | 'failed'
  error?: string
  executionTime: number
}

interface TestRunner {
  test: (name: string, fn: () => void, suite?: string) => void
  warn: (name: string, message: string) => void
  getResults: () => { passed: number; failed: number; warnings: number; results: TestResult[] }
}

function createTestRunner(): TestRunner {
  let passed = 0
  let failed = 0
  let warnings = 0
  let results: TestResult[] = []

  function test(name: string, fn: () => void, suite: string = 'pack_generation'): void {
    const startTime = Date.now()
    try {
      fn()
      console.log(`\x1b[32m✅ ${name}\x1b[0m`)
      passed++
      results.push({
        suite,
        name,
        status: 'passed',
        executionTime: Date.now() - startTime
      })
    } catch (e) {
      console.log(`\x1b[31m❌ ${name}\x1b[0m`)
      console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
      failed++
      results.push({
        suite,
        name,
        status: 'failed',
        error: (e as Error).message,
        executionTime: Date.now() - startTime
      })
    }
  }

  function warn(name: string, message: string): void {
    console.log(`\x1b[33m⚠️  ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${message}\x1b[0m`)
    warnings++
  }

  function getResults(): { passed: number; failed: number; warnings: number; results: TestResult[] } {
    return { passed, failed, warnings, results }
  }

  return { test, warn, getResults }
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function withMockedRandom<T>(value: number, fn: () => T): T {
  const originalRandom = Math.random
  Math.random = () => value
  try {
    return fn()
  } finally {
    Math.random = originalRandom
  }
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
  const originalRandom = Math.random
  let state = seed >>> 0
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  try {
    return fn()
  } finally {
    Math.random = originalRandom
  }
}

function assertWithinTolerance(actual: number, expected: number, tolerance: number, message?: string): void {
  const diff = Math.abs(actual - expected)
  const maxDiff = expected * tolerance
  if (diff > maxDiff) {
    throw new Error(
      message || `Expected ${actual} to be within ${tolerance * 100}% of ${expected} (max diff: ${maxDiff.toFixed(2)}, actual diff: ${diff.toFixed(2)})`
    )
  }
}

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
  aspects?: string[]
  traits?: string[]
  type?: string
}

function leaderKey(card: Card): string {
  return [card.name, (card as any).subtitle || '', card.type || 'Leader'].join('|')
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function assertLeaderSheetBoot(
  setCode: string,
  label: string,
  createBelt: (setCode: string) => any,
): void {
  const belt = createBelt(setCode)
  if (belt.fillingPool?.length === 0) return

  const sheet = Array.from({ length: belt.bootSize }, () => belt.next()).filter(Boolean) as Card[]
  // Prints per common leader come from the set's strip (beltRatios.leaderPrints, default 6).
  const commonPrints: number = belt.prints?.common ?? LEADER_COMMON_PRINTS_PER_BOOT
  const expectedCommonCount = belt.commonLeaders.length * commonPrints
  const expectedRareCount = belt.rareLeaders.length

  assert(sheet.length === belt.bootSize, `${label} ${setCode}: sheet returned ${sheet.length} cards, expected ${belt.bootSize}`)
  assert(
    sheet.filter(card => card.rarity === 'Common').length === expectedCommonCount,
    `${label} ${setCode}: sheet common count does not match ${belt.commonLeaders.length} leaders x ${commonPrints}`
  )
  assert(
    sheet.filter(card => card.rarity === 'Rare').length === expectedRareCount,
    `${label} ${setCode}: sheet rare count does not match one print of each rare leader`
  )

  const commonCounts = countBy(sheet.filter(card => card.rarity === 'Common'), leaderKey)
  const rareCounts = countBy(sheet.filter(card => card.rarity === 'Rare'), leaderKey)

  for (const leader of belt.commonLeaders) {
    const count = commonCounts.get(leaderKey(leader)) || 0
    assert(
      count === commonPrints,
      `${label} ${setCode}: common leader "${leader.name}" appears ${count} times, expected ${commonPrints}`
    )
  }

  for (const leader of belt.rareLeaders) {
    const count = rareCounts.get(leaderKey(leader)) || 0
    assert(
      count === 1,
      `${label} ${setCode}: rare leader "${leader.name}" appears ${count} times, expected 1`
    )
  }
}

function assertNoRareLeaderRepeatsAcrossSeams(
  setCode: string,
  label: string,
  createBelt: (setCode: string) => any,
): void {
  const belt = createBelt(setCode)
  if (belt.fillingPool?.length === 0 || belt.rareLeaders?.length === 0) return

  const leaders = Array.from({ length: belt.bootSize * 3 }, () => belt.next()).filter(Boolean) as Card[]
  for (let start = 0; start <= leaders.length - LEADER_DEDUP_WINDOW; start++) {
    const rareCounts = countBy(
      leaders.slice(start, start + LEADER_DEDUP_WINDOW).filter(card => card.rarity === 'Rare'),
      leaderKey
    )
    for (const [key, count] of rareCounts) {
      assert(
        count === 1,
        `${label} ${setCode}: rare leader ${key} repeated ${count} times in ${LEADER_DEDUP_WINDOW}-leader window starting at ${start}`
      )
    }
  }
}

function assertShowcaseLeaderSheet(setCode: string): void {
  const belt = new ShowcaseLeaderBelt(setCode) as any
  if (belt.fillingPool?.length === 0) return

  const sheet = Array.from({ length: belt.bootSize }, () => belt.next()).filter(Boolean) as Card[]
  const counts = countBy(sheet, leaderKey)

  assert(sheet.length === belt.fillingPool.length, `${setCode}: showcase sheet should contain every showcase leader once`)
  for (const leader of belt.fillingPool) {
    const count = counts.get(leaderKey(leader)) || 0
    assert(count === 1, `${setCode}: showcase leader "${leader.name}" appears ${count} times, expected 1`)
  }
}

function getPackLeader(pack: Pack): Card | null {
  return pack.cards.find(card => card.isLeader) || null
}

function analyzeDraftBoxLeaderDistribution(setCode: string, boxCount: number) {
  const cards = getCachedCards(setCode)
  let missingLeaderBoxes = 0
  let zeroRareBoxes = 0
  let boxesWithSameRareFourPlus = 0
  let maxSameRareInAnyBox = 0
  let minRareLeadersInBox = Number.POSITIVE_INFINITY
  let maxRareLeadersInBox = 0
  let totalRareLeaders = 0
  const rareIdentitySeen = new Set<string>()

  withSeededRandom(0x5eed3074, () => {
    for (let boxIndex = 0; boxIndex < boxCount; boxIndex++) {
      const box = generateSealedBox(cards, setCode, DRAFT_BOX_SIZE)
      const leaders = box.map(getPackLeader).filter(Boolean) as Card[]
      const rareLeaders = leaders.filter(card => card.rarity === 'Rare')
      const rareCounts = countBy(rareLeaders, leaderKey)
      const maxSameRareInBox = Math.max(0, ...Array.from(rareCounts.values()))

      if (leaders.length !== DRAFT_BOX_SIZE) missingLeaderBoxes++
      if (rareLeaders.length === 0) zeroRareBoxes++
      if (maxSameRareInBox >= 4) boxesWithSameRareFourPlus++

      maxSameRareInAnyBox = Math.max(maxSameRareInAnyBox, maxSameRareInBox)
      minRareLeadersInBox = Math.min(minRareLeadersInBox, rareLeaders.length)
      maxRareLeadersInBox = Math.max(maxRareLeadersInBox, rareLeaders.length)
      totalRareLeaders += rareLeaders.length

      for (const leader of rareLeaders) {
        rareIdentitySeen.add(leaderKey(leader))
      }
    }
  })

  return {
    boxCount,
    missingLeaderBoxes,
    zeroRareBoxes,
    boxesWithSameRareFourPlus,
    maxSameRareInAnyBox,
    minRareLeadersInBox: Number.isFinite(minRareLeadersInBox) ? minRareLeadersInBox : 0,
    maxRareLeadersInBox,
    totalRareLeaders,
    rareRate: totalRareLeaders / (boxCount * DRAFT_BOX_SIZE),
    rareIdentitySeen,
  }
}

interface Pack {
  cards: Card[]
}

/**
 * Group cards by their base treatment (variantType + foil status)
 * Cards with different treatments don't count as duplicates:
 * - Normal, Foil, Hyperspace, Hyperspace Foil, Showcase are all distinct
 * We only detect duplicates of the SAME treatment
 */
function getBaseTreatmentKey(card: Card): string {
  const variant = card.variantType || 'Normal'
  const foilSuffix = card.isFoil ? '-Foil' : ''
  return `${card.id}-${variant}${foilSuffix}`
}

/**
 * Count duplicates in a card list
 * Returns { duplicates: count of cards appearing 2+ times, triplicates: count appearing 3+ times }
 * Only counts duplicates of the same base treatment (e.g., two Normal variants)
 */
function countDuplicates(cards: Card[]): { duplicates: number; triplicates: number } {
  const cardCounts = new Map<string, number>()

  cards.forEach(card => {
    const key = getBaseTreatmentKey(card)
    const count = cardCounts.get(key) || 0
    cardCounts.set(key, count + 1)
  })

  let duplicates = 0
  let triplicates = 0

  cardCounts.forEach(count => {
    if (count >= 2) duplicates++
    if (count >= 3) triplicates++
  })

  return { duplicates, triplicates }
}

interface Stats {
  mean: number
  stdDev: number
  min: number
  max: number
}

/**
 * Calculate mean and standard deviation
 */
function calculateStats(values: number[]): Stats {
  const n = values.length
  const mean = values.reduce((sum, val) => sum + val, 0) / n
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n
  const stdDev = Math.sqrt(variance)

  return { mean, stdDev, min: Math.min(...values), max: Math.max(...values) }
}

/**
 * Check if value is a statistical outlier (z-score method)
 */
function checkOutlier(value: number, mean: number, stdDev: number, threshold: number = 2): boolean {
  if (stdDev === 0) return false // No variation, not an outlier
  const zScore = Math.abs((value - mean) / stdDev)
  return zScore > threshold
}

async function runQA(silentMode: boolean = false): Promise<TestResult[]> {
  const { test, warn, getResults } = createTestRunner()

  if (!silentMode) {
    console.log('\x1b[1m\x1b[36m📊 Pack Generation QA\x1b[0m')
    console.log('\x1b[36m============================\x1b[0m')
    console.log(`\x1b[36m📦 Pod sample size: ${POD_SAMPLE_SIZE} (${POD_SAMPLE_SIZE * PACKS_PER_POD} packs total)\x1b[0m`)
    console.log(`\x1b[36m📏 Tolerance: ${TOLERANCE * 100}%\x1b[0m`)
    console.log('')

    console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  }

  await initializeCardCache()

  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

  console.log('')
  console.log('\x1b[36m👑 Testing Leader Sheet Collation...\x1b[0m')

  for (const setCode of LEADER_QA_SETS) {
    const cards = getCachedCards(setCode)
    if (cards.length === 0) {
      test(`${setCode}: has card data`, () => { throw new Error(`no card data for ${setCode}`) })
      continue
    }

    test(`${setCode}: standard leader sheet prints six commons and one of each rare`, () => {
      assertLeaderSheetBoot(setCode, 'standard leader sheet', code => new LeaderBelt(code))
    })

    test(`${setCode}: standard leader sheet prevents rare repeats across seams`, () => {
      assertNoRareLeaderRepeatsAcrossSeams(setCode, 'standard leader sheet', code => new LeaderBelt(code))
    })

    test(`${setCode}: hyperspace leader sheet prints six commons and one of each rare`, () => {
      assertLeaderSheetBoot(setCode, 'hyperspace leader sheet', code => new HyperspaceLeaderBelt(code))
    })

    test(`${setCode}: hyperspace leader sheet prevents rare repeats across seams`, () => {
      assertNoRareLeaderRepeatsAcrossSeams(setCode, 'hyperspace leader sheet', code => new HyperspaceLeaderBelt(code))
    })

    test(`${setCode}: showcase leader sheet gives each leader equal weight`, () => {
      assertShowcaseLeaderSheet(setCode)
    })
  }

  console.log('')
  console.log(`\x1b[36m📦 Testing ${LEADER_BOX_QA_SAMPLE_SIZE} ${LEADER_BOX_QA_SET} Draft Boxes for Leader Variance...\x1b[0m`)

  test(`${LEADER_BOX_QA_SET}: ${LEADER_BOX_QA_SAMPLE_SIZE} draft boxes have no zero-rare leader boxes or 4x same rare leader`, () => {
    const cards = getCachedCards(LEADER_BOX_QA_SET)
    assert(cards.length > 0, `no card data for ${LEADER_BOX_QA_SET}`)

    const stats = analyzeDraftBoxLeaderDistribution(LEADER_BOX_QA_SET, LEADER_BOX_QA_SAMPLE_SIZE)
    const rareLeaderCount = cards.filter(card =>
      card.isLeader &&
      card.variantType === 'Normal' &&
      card.rarity === 'Rare'
    ).length

    console.log(`\x1b[36m   Boxes sampled: ${stats.boxCount} (${stats.boxCount * DRAFT_BOX_SIZE} packs)\x1b[0m`)
    console.log(`\x1b[36m   Rare leader rate: ${(stats.rareRate * 100).toFixed(2)}% (${stats.totalRareLeaders}/${stats.boxCount * DRAFT_BOX_SIZE})\x1b[0m`)
    console.log(`\x1b[36m   Rare leaders per box: range=[${stats.minRareLeadersInBox}-${stats.maxRareLeadersInBox}]\x1b[0m`)
    console.log(`\x1b[36m   Max same rare leader in a box: ${stats.maxSameRareInAnyBox}\x1b[0m`)

    assert(stats.missingLeaderBoxes === 0, `${stats.missingLeaderBoxes} boxes did not contain exactly ${DRAFT_BOX_SIZE} leader slots`)
    // Zero-rare boxes are not structurally prevented: a box's rare leaders can
    // each be HS-replaced by a common HS leader, so P(zero-rare) is tiny but
    // nonzero. Measured true rate: 0.85/1000 (17 in 20,000 ASH boxes). Over a
    // seeded 1000-box sample that's Poisson(~0.85), so a ≤2 cap false-fails ~5.5%
    // of RNG streams — any unrelated code change (e.g. a bigger foil boot) shifts
    // the call order and can tip it. Cap at 6: negligible false-fail at the true
    // rate (P≈0.03%) while still catching a real regression (≥6/1000 = 0.6%/box).
    assert(stats.zeroRareBoxes <= 6, `${stats.zeroRareBoxes}/${stats.boxCount} boxes had zero rare leaders (allowed: ≤6/1000; measured true rate 0.85/1000)`)
    assert(
      stats.boxesWithSameRareFourPlus === 0,
      `${stats.boxesWithSameRareFourPlus}/${stats.boxCount} boxes had the same rare leader 4+ times`
    )
    assert(
      stats.rareIdentitySeen.size === rareLeaderCount,
      `Only saw ${stats.rareIdentitySeen.size}/${rareLeaderCount} rare leader identities across ${stats.boxCount} boxes`
    )
    // Every leader a box shows comes off a 4:1 strip (normal and hyperspace
    // sheets alike, beltRatios.leaderPrints), so the rare share is the strip's
    // — rare prints / sheet size — in ANY 24 pulls. The old expectation here
    // (2 normal rares per fresh 24-pack cut, 11.1%) described rare holes
    // parked at the end of each cell, past a box's horizon; every one of the
    // 11 opened ASH boxes held 4-6 rare leaders, which refuted it.
    const prints = getSetConfig(LEADER_BOX_QA_SET).beltRatios.leaderPrints ?? { common: LEADER_COMMON_PRINTS_PER_BOOT, rare: 1 }
    const expectedRareRate = prints.rare / (prints.common + prints.rare)
    assertWithinTolerance(stats.rareRate, expectedRareRate, 0.1,
      `Rare leader rate ${(stats.rareRate * 100).toFixed(2)}% differs from the strip ratio ${(expectedRareRate * 100).toFixed(2)}%`)

  })

  for (const [setIndex, setCode] of sets.entries()) {
    console.log('')
    console.log(`\x1b[1m\x1b[35m=== 🎴 ${setCode} ===\x1b[0m`)
    const cards = getCachedCards(setCode)

    if (cards.length === 0) {
      test(`${setCode}: has card data`, () => { throw new Error(`no card data for ${setCode}`) })
      continue
    }

    // Generate sealed pods
    console.log(`\x1b[36m🎁 Generating ${POD_SAMPLE_SIZE} sealed pods (${POD_SAMPLE_SIZE * PACKS_PER_POD} packs)...\x1b[0m`)
    clearBeltCache()
    const pods = withSeededRandom(PACK_QA_SEED_BASE + setIndex, () => {
      const generatedPods: Pack[][] = []
      for (let i = 0; i < POD_SAMPLE_SIZE; i++) {
        generatedPods.push(generateSealedPod(cards, setCode, PACKS_PER_POD))
      }
      return generatedPods
    })
    console.log('\x1b[32m✔️  Generation complete.\x1b[0m')
    console.log('')

    // ===== INDIVIDUAL PACK TESTS =====
    console.log('\x1b[36m📦 Testing Individual Packs...\x1b[0m')

    const allPacks = pods.flat()

    test(`${setCode}: all packs have 16 cards`, () => {
      allPacks.forEach((pack, i) => {
        assert(
          pack.cards.length === 16,
          `Pack ${i} has ${pack.cards.length} cards (expected 16)`
        )
      })
    })

    test(`${setCode}: all packs have exactly 1 leader`, () => {
      allPacks.forEach((pack, i) => {
        const leaders = pack.cards.filter(c => c.isLeader)
        assert(
          leaders.length === 1,
          `Pack ${i} has ${leaders.length} leaders (expected 1)`
        )
      })
    })

    test(`${setCode}: 24-pack draft boxes cannot have zero rare leaders`, () => {
      withMockedRandom(0.5, () => {
        clearBeltCache()
        const box = generateSealedBox(cards, setCode, 24)
        const leaders = box
          .map(pack => pack.cards.find(c => c.isLeader))
          .filter(Boolean) as Card[]
        const rareLeaders = leaders.filter(c => c.rarity === 'Rare')

        assert(
          rareLeaders.length > 0,
          `${setCode} 24-pack draft box produced zero rare leaders`
        )
      })
    })

    test(`${setCode}: all packs have exactly 1 common base`, () => {
      allPacks.forEach((pack, i) => {
        const commonBases = pack.cards.filter(c => c.isBase && c.rarity === 'Common')
        assert(
          commonBases.length === 1,
          `Pack ${i} has ${commonBases.length} common bases (expected 1)`
        )
      })
    })

    test(`${setCode}: all packs have exactly 1 foil`, () => {
      allPacks.forEach((pack, i) => {
        const foils = pack.cards.filter(c => c.isFoil)
        assert(
          foils.length === 1,
          `Pack ${i} has ${foils.length} foils (expected 1)`
        )
      })
    })

    // CRITICAL: No duplicates of same base treatment within a single pack
    test(`${setCode}: no duplicate base treatment cards within any pack`, () => {
      const packsWithDuplicates: { packIndex: number; duplicates: { id: string; name: string; variant: string }[] }[] = []

      allPacks.forEach((pack, packIndex) => {
        const seen = new Map<string, Card>()
        const duplicates: { id: string; name: string; variant: string }[] = []

        pack.cards.forEach(card => {
          const key = getBaseTreatmentKey(card)
          if (seen.has(key)) {
            const variant = card.variantType || 'Normal'
            duplicates.push({ id: card.id, name: card.name, variant })
          }
          seen.set(key, card)
        })

        if (duplicates.length > 0) {
          packsWithDuplicates.push({
            packIndex,
            duplicates
          })
        }
      })

      if (packsWithDuplicates.length > 0) {
        const examples = packsWithDuplicates.slice(0, 3).map(p => {
          const dupes = p.duplicates.map(d => `"${d.name}" [${d.variant}] (${d.id})`).join(', ')
          return `Pack ${p.packIndex}: ${dupes}`
        }).join('; ')
        const total = packsWithDuplicates.length
        const suffix = total > 3 ? ` (+${total - 3} more)` : ''
        throw new Error(
          `Found ${total} packs with duplicate base treatment cards${suffix}. Examples: ${examples}`
        )
      }
    })

    // Rarity distribution - exact counts per pack (excluding foils)
    // Test each pack individually for exact counts
    test(`${setCode}: all packs have exactly 9 commons (non-foil)`, () => {
      allPacks.forEach((pack, i) => {
        const commons = pack.cards.filter(c =>
          c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
        )
        assert(
          commons.length === 9,
          `Pack ${i} has ${commons.length} commons (expected exactly 9)`
        )
      })
    })

    test(`${setCode}: packs have 2 or 3 uncommons (non-foil, depending on upgrade)`, () => {
      allPacks.forEach((pack, i) => {
        const uncommons = pack.cards.filter(c =>
          c.rarity === 'Uncommon' && !c.isFoil
        )
        // 3rd UC slot can upgrade to R/L, so we expect 2 or 3 uncommons
        assert(
          uncommons.length === 2 || uncommons.length === 3,
          `Pack ${i} has ${uncommons.length} uncommons (expected 2 or 3)`
        )
      })
    })

    test(`${setCode}: packs have 1 or 2 rare/legendary/special in non-foil slots`, () => {
      allPacks.forEach((pack, i) => {
        // Count rare+ cards in non-foil slots (excludes foil slot)
        // Rare bases count as R/L (they occupy the R/L slot in sets 1-6)
        const rarePlus = pack.cards.filter(c =>
          (c.rarity === 'Rare' || c.rarity === 'Legendary' || c.rarity === 'Special') &&
          !c.isFoil && !c.isLeader
        )

        // Base rare slot: always 1 R/L/S
        // 3rd UC slot: sometimes upgrades to R/L, giving us 2 total
        assert(
          rarePlus.length === 1 || rarePlus.length === 2,
          `Pack ${i} has ${rarePlus.length} non-foil rare/legendary/special (expected 1 or 2)`
        )
      })
    })

    test(`${setCode}: when UC slot upgrades, counts are consistent`, () => {
      allPacks.forEach((pack, i) => {
        const uncommons = pack.cards.filter(c =>
          c.rarity === 'Uncommon' && !c.isFoil && !c.isLeader && !c.isBase
        )
        const rarePlus = pack.cards.filter(c =>
          (c.rarity === 'Rare' || c.rarity === 'Legendary' || c.rarity === 'Special') &&
          !c.isFoil && !c.isLeader
        )

        // Total non-foil UC + R/L should always be 4
        // Either 3 UC + 1 R/L (not upgraded) or 2 UC + 2 R/L (upgraded)
        const total = uncommons.length + rarePlus.length
        assert(
          total === 4,
          `Pack ${i} has ${uncommons.length} UC + ${rarePlus.length} R/L/S = ${total} total (expected 4)`
        )

        // Specifically check the two valid states
        const validStates = (
          (uncommons.length === 3 && rarePlus.length === 1) || // Not upgraded
          (uncommons.length === 2 && rarePlus.length === 2)    // Upgraded
        )
        assert(
          validStates,
          `Pack ${i} has ${uncommons.length} UC and ${rarePlus.length} R/L/S (expected 3+1 or 2+2)`
        )
      })
    })

    // ===== SEALED POD TESTS (Cross-Pack Duplicates) =====
    console.log('')
    console.log('\x1b[36m🎁 Testing Sealed Pods (Cross-Pack Duplicates)...\x1b[0m')

    // Collect duplicate statistics across all pods
    const podDuplicateCounts: number[] = []
    const podTriplicateCounts: number[] = []

    pods.forEach(pod => {
      const allCards = pod.flatMap(pack => pack.cards)
      const { duplicates, triplicates } = countDuplicates(allCards)
      podDuplicateCounts.push(duplicates)
      podTriplicateCounts.push(triplicates)
    })

    const dupStats = calculateStats(podDuplicateCounts)
    const tripStats = calculateStats(podTriplicateCounts)

    console.log(`\x1b[36m   Duplicates across pod: mean=${dupStats.mean.toFixed(1)}, σ=${dupStats.stdDev.toFixed(1)}, range=[${dupStats.min}-${dupStats.max}]\x1b[0m`)
    console.log(`\x1b[36m   Triplicates across pod: mean=${tripStats.mean.toFixed(1)}, σ=${tripStats.stdDev.toFixed(1)}, range=[${tripStats.min}-${tripStats.max}]\x1b[0m`)

    test(`${setCode}: duplicate distribution across pods is reasonable`, () => {
      // When mean is very low (< 1.0), skip statistical outlier check
      // because low-count discrete distributions don't follow normal distribution well
      if (dupStats.mean < 1.0) {
        // Just check that max duplicates is reasonable (< 6 per 6-pack pod)
        // With belt-based generation and upgrade passes, 5 duplicates can occur rarely
        const maxDuplicates = Math.max(...podDuplicateCounts)
        if (maxDuplicates >= 6) {
          throw new Error(`Found pod with ${maxDuplicates} duplicates (expected < 6 when duplicate rate is very low)`)
        }
        return
      }

      // Check for pods that are statistical outliers (>3σ)
      // With 100 pods per set, we expect ~0.3 outliers (0.3% at 3σ)
      // Allow up to 2 outliers as normal statistical variance
      const MAX_ALLOWED_OUTLIERS = 2
      const outliers: { index: number; count: number; zScore: string }[] = []
      pods.forEach((pod, i) => {
        const dupCount = podDuplicateCounts[i]
        if (checkOutlier(dupCount, dupStats.mean, dupStats.stdDev, 3)) {
          outliers.push({ index: i, count: dupCount, zScore: Math.abs((dupCount - dupStats.mean) / dupStats.stdDev).toFixed(2) })
        }
      })

      if (outliers.length > MAX_ALLOWED_OUTLIERS) {
        const examples = outliers.slice(0, 3).map(o =>
          `Pod ${o.index}: ${o.count} duplicates (z=${o.zScore})`
        ).join(', ')
        throw new Error(
          `Found ${outliers.length} pods with extreme duplicate counts (>3σ), exceeds ${MAX_ALLOWED_OUTLIERS} allowed. Examples: ${examples}`
        )
      }
    })

    test(`${setCode}: triplicate distribution across pods is reasonable`, () => {
      // When mean is very low (< 0.5), skip statistical outlier check
      // because low-count discrete distributions don't follow normal distribution well
      if (tripStats.mean < 0.5) {
        // Just check that max triplicates is reasonable (< 3 per pod)
        const maxTriplicates = Math.max(...podTriplicateCounts)
        if (maxTriplicates >= 3) {
          throw new Error(`Found pod with ${maxTriplicates} triplicates (expected < 3 when triplicate rate is very low)`)
        }
        return
      }

      // Check for pods that are statistical outliers (>3σ)
      // With 100 pods per set, we expect ~0.3 outliers (0.3% at 3σ)
      // Allow up to 2 outliers as normal statistical variance
      const MAX_ALLOWED_OUTLIERS = 2
      const outliers: { index: number; count: number; zScore: string }[] = []
      pods.forEach((pod, i) => {
        const tripCount = podTriplicateCounts[i]
        if (checkOutlier(tripCount, tripStats.mean, tripStats.stdDev, 3)) {
          outliers.push({ index: i, count: tripCount, zScore: Math.abs((tripCount - tripStats.mean) / tripStats.stdDev).toFixed(2) })
        }
      })

      if (outliers.length > MAX_ALLOWED_OUTLIERS) {
        const examples = outliers.slice(0, 3).map(o =>
          `Pod ${o.index}: ${o.count} triplicates (z=${o.zScore})`
        ).join(', ')
        throw new Error(
          `Found ${outliers.length} pods with extreme triplicate counts (>3σ), exceeds ${MAX_ALLOWED_OUTLIERS} allowed. Examples: ${examples}`
        )
      }
    })

    // Test: Number of 2σ outliers should match statistical expectations
    test(`${setCode}: number of 2σ outliers is statistically reasonable`, () => {
      // When mean is very low (< 0.5), skip this test
      // because low-count discrete distributions don't follow normal distribution well
      if (dupStats.mean < 0.5) {
        return
      }

      // Count pods outside 2σ (in either direction)
      const twoSigmaOutliers = pods.filter((pod, i) => {
        const dupCount = podDuplicateCounts[i]
        return checkOutlier(dupCount, dupStats.mean, dupStats.stdDev, 2)
      }).length

      // For normal distribution, expect ~5% outside 2σ
      const expectedOutliers = POD_SAMPLE_SIZE * 0.05
      const stdDevOutliers = Math.sqrt(POD_SAMPLE_SIZE * 0.05 * 0.95)

      // 95% confidence interval: expected ± 2 * stdDev
      const minExpected = Math.max(0, expectedOutliers - 2 * stdDevOutliers)
      const maxExpected = expectedOutliers + 2 * stdDevOutliers

      // Fail if outside 99% confidence interval (± 3 stdDev)
      const minFail = Math.max(0, expectedOutliers - 3 * stdDevOutliers)
      const maxFail = expectedOutliers + 3 * stdDevOutliers

      if (twoSigmaOutliers < minFail || twoSigmaOutliers > maxFail) {
        throw new Error(
          `Found ${twoSigmaOutliers} 2σ outliers, expected ${expectedOutliers.toFixed(1)} ± ${(3 * stdDevOutliers).toFixed(1)} (99% CI: [${minFail.toFixed(0)}, ${maxFail.toFixed(0)}])`
        )
      }

      // Warn if outside 95% confidence interval
      if (twoSigmaOutliers < minExpected || twoSigmaOutliers > maxExpected) {
        warn(
          `${setCode}: unusual number of 2σ outliers`,
          `Found ${twoSigmaOutliers}, expected ${expectedOutliers.toFixed(1)} ± ${(2 * stdDevOutliers).toFixed(1)} (95% CI: [${minExpected.toFixed(0)}, ${maxExpected.toFixed(0)}])`
        )
      }
    })

    // List 2σ outliers for reference (not a test failure)
    const dupWarningOutliers: { index: number; count: number }[] = []
    pods.forEach((pod, i) => {
      const dupCount = podDuplicateCounts[i]
      if (checkOutlier(dupCount, dupStats.mean, dupStats.stdDev, 2) && !checkOutlier(dupCount, dupStats.mean, dupStats.stdDev, 3)) {
        dupWarningOutliers.push({ index: i, count: dupCount })
      }
    })
    if (dupWarningOutliers.length > 0 && dupWarningOutliers.length <= 3) {
      console.log(`\x1b[36m   2σ outliers: ${dupWarningOutliers.map(o => `#${o.index}(${o.count})`).join(', ')}\x1b[0m`)
    } else if (dupWarningOutliers.length > 3) {
      console.log(`\x1b[36m   2σ outliers: ${dupWarningOutliers.length} pods (${dupWarningOutliers.slice(0, 3).map(o => `#${o.index}(${o.count})`).join(', ')}...)\x1b[0m`)
    }

    // ===== HS+NORMAL SAME-LEADER TESTS =====
    console.log('')
    console.log('\x1b[36m🎯 Testing HS+Normal Same-Leader Pairs...\x1b[0m')

    // Statistical test: The LeaderBelt's weighted pool means the same leader name
    // can appear multiple times across 6 packs (non-adjacent). When one copy upgrades
    // to HS and another stays Normal, we get both variants.
    test(`${setCode}: HS+Normal same-leader rate stays within a sane range for independent belts`, () => {
      let podsWithViolation = 0
      const violationExamples: string[] = []

      pods.forEach((pod, podIndex) => {
        // Collect all leaders in the pod
        const leaders: Card[] = []
        pod.forEach(pack => {
          const leader = pack.cards.find(c => c.isLeader)
          if (leader) leaders.push(leader)
        })

        // Check for same leader appearing as both HS and Normal
        const leadersByName: Record<string, Card[]> = {}
        for (const leader of leaders) {
          if (!leadersByName[leader.name]) {
            leadersByName[leader.name] = []
          }
          leadersByName[leader.name].push(leader)
        }

        let podHasViolation = false
        for (const [name, instances] of Object.entries(leadersByName)) {
          const hasHS = instances.some(l => l.isHyperspace || l.variantType === 'Hyperspace')
          const hasNormal = instances.some(l => !l.isHyperspace && l.variantType === 'Normal')

          if (hasHS && hasNormal) {
            podHasViolation = true
            if (violationExamples.length < 3) {
              violationExamples.push(`Pod ${podIndex}: ${name}`)
            }
          }
        }

        if (podHasViolation) {
          podsWithViolation++
        }
      })

      const observedRate = podsWithViolation / pods.length
      const maxAcceptableRate = 0.60

      console.log(`\x1b[36m   HS+Normal same-leader pod rate: ${(observedRate * 100).toFixed(1)}% (${podsWithViolation}/${pods.length})\x1b[0m`)
      console.log(`\x1b[36m   Independent-belt sanity cap: ${(maxAcceptableRate * 100).toFixed(0)}%\x1b[0m`)

      if (violationExamples.length > 0) {
        console.log(`\x1b[36m   Examples: ${violationExamples.join('; ')}\x1b[0m`)
      }

      if (observedRate > maxAcceptableRate) {
        throw new Error(
          `HS+Normal same-leader rate (${(observedRate * 100).toFixed(1)}%) exceeds ${(maxAcceptableRate * 100).toFixed(0)}% ` +
          `for independent leader belts. ` +
          `Examples: ${violationExamples.join('; ')}`
        )
      }
    })

    // ===== CARD + FOIL CO-OCCURRENCE TESTS =====
    console.log('')
    console.log('\x1b[36m✨ Testing Card + Foil Co-occurrence...\x1b[0m')

    // Test: Within individual packs, card+foil pair rate should be low
    // UX goal: Players shouldn't frequently get same card as both foil and non-foil
    test(`${setCode}: card+foil pairs within single packs should be rare (ideal < 5%)`, () => {
      let pairsFound = 0
      const pairExamples: string[] = []

      allPacks.forEach((pack, packIndex) => {
        const foil = pack.cards.find(c => c.isFoil)
        if (!foil) return

        const nonFoilMatch = pack.cards.find(c => c.id === foil.id && !c.isFoil)
        if (nonFoilMatch) {
          pairsFound++
          if (pairExamples.length < 3) {
            pairExamples.push(`"${foil.name}" (${foil.rarity})`)
          }
        }
      })

      const n = allPacks.length
      const observedRate = pairsFound / n

      // UX thresholds:
      // Based on actual data: foils are weighted toward commons (50-70% rate)
      // Since commons also dominate the 9 non-foil slots, overlap is expected
      // Realistic thresholds based on observed behavior:
      // Acceptable: < 15% - this is the natural rate given the mechanics
      const acceptableRate = 0.15

      console.log(`\x1b[36m   Single pack card+foil pair rate: ${(observedRate * 100).toFixed(2)}% (${pairsFound}/${n})\x1b[0m`)
      console.log(`\x1b[36m   Target: < ${acceptableRate * 100}% acceptable\x1b[0m`)

      if (observedRate > acceptableRate) {
        throw new Error(
          `Card+foil pair rate (${(observedRate * 100).toFixed(1)}%) exceeds acceptable ${acceptableRate * 100}% for ${setCode}. ` +
          `Too many packs have matching foil+non-foil cards. Examples: ${pairExamples.join('; ')}`
        )
      }
    })

    // (A "pods with card+foil pairs < 100%" test was removed: its threshold was
    // 1.0, so it could not fail.)

    // Test: Average pairs per pod should be reasonable
    // Even if most pods have pairs, the average shouldn't be excessive
    test(`${setCode}: average card+foil pairs per pod should be reasonable (< 5)`, () => {
      let totalPairs = 0
      const podPairCounts: number[] = []

      pods.forEach(pod => {
        const allCardsInPod = pod.flatMap(pack => pack.cards)
        const foils = allCardsInPod.filter(c => c.isFoil && !c.isLeader && !c.isBase)
        const nonFoils = allCardsInPod.filter(c => !c.isFoil && !c.isLeader && !c.isBase)

        let pairsInPod = 0
        foils.forEach(foil => {
          const matchingNonFoil = nonFoils.find(c => c.id === foil.id)
          if (matchingNonFoil) {
            pairsInPod++
          }
        })
        podPairCounts.push(pairsInPod)
        totalPairs += pairsInPod
      })

      const avgPairsPerPod = totalPairs / pods.length
      const stats = calculateStats(podPairCounts)

      // Realistic threshold based on actual pack generation mechanics:
      // With foils weighted toward commons and 9 commons per pack, 2-3 pairs per pod is expected
      // Only fail if average exceeds 5 (which would indicate broken randomization)
      const acceptableAvg = 5.0

      console.log(`\x1b[36m   Average pairs per pod: ${avgPairsPerPod.toFixed(2)}\x1b[0m`)
      console.log(`\x1b[36m   Target: < ${acceptableAvg} acceptable\x1b[0m`)

      if (avgPairsPerPod > acceptableAvg) {
        throw new Error(
          `Average pairs per pod (${avgPairsPerPod.toFixed(2)}) exceeds acceptable ${acceptableAvg} for ${setCode}. ` +
          `This may indicate broken randomization or biased foil selection.`
        )
      }
    })

    // ===== DUPLICATE/TRIPLICATE ANALYSIS =====
    console.log('')
    console.log('\x1b[36m🔄 Testing Duplicate/Triplicate Distribution...\x1b[0m')

    // (Removed 2026-10-10: four "excess copies" checks against EXPECTED_BY_SET.
    // Those were characterization baselines of ONE seeded draw, not derivable
    // expectations — and excessNormalByName {mean 0.0, sd 0.10} locked in zero
    // same-name Normal duplicates, i.e. a dedup assertion, which the belt rules
    // forbid. Pool-level duplicate behaviour is tested against the real boxes
    // in printerDistribution.test.ts (KS) instead.)

    // ===== RATE TESTS (matching stats quality tab) =====
    console.log('')
    console.log('\x1b[36m📈 Testing Rate Metrics (Stats Quality Tab)...\x1b[0m')

    const setNum = ['SOR', 'SHD', 'TWI'].includes(setCode) ? 1 : 4

    // Legendary rate in R/L slot (card index 14). Expected ratio comes from the set
    // config (single source of truth) — sets 1-3 = 7:1 (1 in 8); JTL onward = 4:1 (1 in 5,
    // FFG "Updates and Rotations": legendaries ~1 in 5 packs starting with Jump to Lightspeed).
    test(`${setCode}: legendary rate in R/L slot matches expected`, () => {
      const rlCards = allPacks.map(p => p.cards[14])
      const legendaryCount = rlCards.filter(c => c.rarity === 'Legendary').length
      const total = rlCards.length

      const ratio = getSetConfig(setCode)?.beltRatios?.rareToLegendary ?? (setNum <= 3 ? 7 : 4)
      // Expected rate = 1 / (ratio + 1) because we want 1 legendary per ratio rares
      const expectedRate = 1 / (ratio + 1)
      const expected = total * expectedRate
      const stdDev = Math.sqrt(total * expectedRate * (1 - expectedRate))
      const zScore = stdDev > 0 ? (legendaryCount - expected) / stdDev : 0

      console.log(`\x1b[36m   Legendary rate: ${legendaryCount}/${total} = ${(legendaryCount/total*100).toFixed(1)}% (expected ${(expectedRate*100).toFixed(1)}%, z=${zScore.toFixed(2)})\x1b[0m`)

      if (Math.abs(zScore) > 3) {
        throw new Error(
          `Legendary rate z-score ${zScore.toFixed(2)} exceeds threshold 3. ` +
          `Got ${legendaryCount}/${total} = ${(legendaryCount/total*100).toFixed(1)}%, expected ${(expectedRate*100).toFixed(1)}%`
        )
      }
    })

    // Hyperfoil rate (foil slot, index 15, with isHyperspace)
    test(`${setCode}: hyperfoil rate matches expected (~2%)`, () => {
      const foilCards = allPacks.map(p => p.cards[15])
      const hyperfoilCount = foilCards.filter(c => c.isFoil && c.isHyperspace).length
      const total = foilCards.length

      const expectedRate = getSetConfig(setCode)!.upgradeProbabilities.foilToHyperfoil
      const expected = total * expectedRate
      const stdDev = Math.sqrt(total * expectedRate * (1 - expectedRate))
      const zScore = stdDev > 0 ? (hyperfoilCount - expected) / stdDev : 0

      console.log(`\x1b[36m   Hyperfoil rate: ${hyperfoilCount}/${total} = ${(hyperfoilCount/total*100).toFixed(1)}% (expected ${(expectedRate*100).toFixed(1)}%, z=${zScore.toFixed(2)})\x1b[0m`)

      // Use z=3.5 threshold since hyperfoil is rare and has high variance
      if (Math.abs(zScore) > 3.5) {
        throw new Error(
          `Hyperfoil rate z-score ${zScore.toFixed(2)} exceeds threshold 3.5. ` +
          `Got ${hyperfoilCount}/${total} = ${(hyperfoilCount/total*100).toFixed(1)}%, expected ${(expectedRate*100).toFixed(1)}%`
        )
      }
    })

    // Showcase leader rate (leader slot, index 0). Expected rate from the set
    // config (leaderToShowcase, 1/288 for Sets 1-6); band ±4 binomial σ.
    test(`${setCode}: showcase leader rate matches leaderToShowcase (±4σ)`, () => {
      const leaders = allPacks.map(p => p.cards[0])
      const showcaseCount = leaders.filter(c =>
        c.variantType === 'Showcase' || (c as any).isShowcase
      ).length
      const total = leaders.length

      const expectedRate = getSetConfig(setCode)!.upgradeProbabilities.leaderToShowcase
      const expected = total * expectedRate
      const tol = 4 * Math.sqrt(total * expectedRate * (1 - expectedRate))

      console.log(`\x1b[36m   Showcase leader rate: ${showcaseCount}/${total} (expected ${expected.toFixed(1)} ± ${tol.toFixed(1)})\x1b[0m`)
      if (Math.abs(showcaseCount - expected) > tol) {
        throw new Error(
          `Showcase leader count ${showcaseCount} outside ${expected.toFixed(1)} ± ${tol.toFixed(1)}`
        )
      }
    })

    // Card variety tests
    test(`${setCode}: good card variety across all packs`, () => {
      const cardFrequency = new Map<string, number>()
      allPacks.forEach(pack => {
        pack.cards.forEach(card => {
          const key = getBaseTreatmentKey(card)
          cardFrequency.set(key, (cardFrequency.get(key) || 0) + 1)
        })
      })

      const tooFrequent: { name: string; variant: string; count: number; frequency: string }[] = []
      const threshold = allPacks.length * 0.5 // Appears in >50% of packs
      cardFrequency.forEach((count, key) => {
        if (count > threshold) {
          const card = allPacks.flatMap(p => p.cards).find(c => getBaseTreatmentKey(c) === key)
          const variant = card?.variantType || 'Normal'
          tooFrequent.push({ name: card?.name || 'unknown', variant, count, frequency: (count / allPacks.length).toFixed(2) })
        }
      })

      if (tooFrequent.length > 0) {
        const list = tooFrequent.slice(0, 3).map(c => `"${c.name}" [${c.variant}] (${(parseFloat(c.frequency) * 100).toFixed(0)}%)`).join(', ')
        throw new Error(`${tooFrequent.length} cards appear too frequently: ${list}`)
      }
    })

    test(`${setCode}: leaders show good variety`, () => {
      const leaderFrequency = new Map<string, number>()
      allPacks.forEach(pack => {
        const leader = pack.cards.find(c => c.isLeader)
        if (leader) {
          leaderFrequency.set(leader.id, (leaderFrequency.get(leader.id) || 0) + 1)
        }
      })

      const uniqueLeaders = leaderFrequency.size
      const minExpected = Math.min(10, Math.floor(allPacks.length / 30)) // At least 1 unique per 30 packs, min 10
      assert(
        uniqueLeaders >= minExpected,
        `Only ${uniqueLeaders} unique leaders in ${allPacks.length} packs (expected at least ${minExpected})`
      )
    })
  }

  // ===== Set 7+ (LAW, ASH) STRUCTURE =====
  // Same pipeline (lineStackingCollation, HSF foil slot, dedicated HS common).
  // Slot order (.claude/rules/belt-system.md): 0 leader · 1 base · 2-10 commons ·
  // 11 Hyperspace Foil · 12-14 uncommons · 15 R/L.
  for (const setCode of ['LAW', 'ASH']) {
    console.log('')
    console.log(`\x1b[1m\x1b[35m=== 🎴 ${setCode} structure ===\x1b[0m`)
    const cards = getCachedCards(setCode)
    if (cards.length === 0) {
      test(`${setCode}: has card data`, () => { throw new Error(`no card data for ${setCode}`) })
      continue
    }
    clearBeltCache()
    const packs: Pack[] = []
    for (let b = 0; b < 25; b++) packs.push(...generateSealedBox(cards, setCode))

    test(`${setCode}: all packs have 16 cards`, () => {
      const bad = packs.filter(p => p.cards.length !== 16)
      assert(bad.length === 0, `${bad.length}/${packs.length} packs not 16 cards`)
    })
    test(`${setCode}: all packs have exactly 1 leader, at index 0`, () => {
      const bad = packs.filter(p => p.cards.filter(c => c.isLeader).length !== 1 || !p.cards[0]?.isLeader)
      assert(bad.length === 0, `${bad.length}/${packs.length} packs without exactly one leader at index 0`)
    })
    test(`${setCode}: all packs have exactly 1 common base, at index 1`, () => {
      // Rare bases (e.g. LAW's Alliance Outpost) legitimately arrive through the
      // R/L slot (index 15); the BASE SLOT is the one common base.
      const bad = packs.filter(p => p.cards.filter(c => c.isBase && c.rarity === 'Common').length !== 1 || !p.cards[1]?.isBase)
      assert(bad.length === 0, `${bad.length}/${packs.length} packs without exactly one common base at index 1`)
      const stray = packs.filter(p => p.cards.some((c, i) => c.isBase && i !== 1 && i !== 15))
      assert(stray.length === 0, `${stray.length}/${packs.length} packs with a base outside the base and R/L slots`)
    })
    test(`${setCode}: foil slot (index 11) is present and Hyperspace Foil in every pack`, () => {
      const bad = packs.filter(p => !(p.cards[11]?.isFoil && p.cards[11]?.isHyperspace))
      assert(bad.length === 0, `${bad.length}/${packs.length} packs missing the HSF slot`)
      const foils = packs.map(p => p.cards.filter(c => c.isFoil).length)
      assert(foils.every(n => n === 1), `packs with ≠1 foil: ${foils.filter(n => n !== 1).length}`)
    })
  }

  // ===== DETERMINISM =====
  // The generator has no seed/rng PARAMETER; its only entropy source is
  // Math.random. With Math.random seeded, the same call must produce the same
  // packs — this catches hidden entropy (Date, crypto, iteration over unordered
  // state) that would make seeded QA draws unreproducible.
  test('generator is deterministic under a seeded Math.random (ASH box, SOR pod)', () => {
    const run = () => {
      clearBeltCache()
      const box = generateSealedBox([], 'ASH')
      clearBeltCache()
      const pod = generateSealedPod([], 'SOR', 6)
      return [...box, ...pod].map(p => p.cards.map(c => c.id).join(',')).join('|')
    }
    const a = withSeededRandom(0xd37e2a11, run)
    const b = withSeededRandom(0xd37e2a11, run)
    const c = withSeededRandom(0xd37e2a12, run)
    assert(a === b, 'same seed produced different packs — hidden entropy in the generator')
    assert(a !== c, 'different seeds produced identical packs — Math.random is not the entropy source')
  })

  const { passed, failed, warnings, results } = getResults()

  if (!silentMode) {
    console.log('')
    console.log('\x1b[36m============================\x1b[0m')
    console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
    if (failed > 0) {
      console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
    } else {
      console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
    }
    if (warnings > 0) {
      console.log(`\x1b[33m⚠️  Warnings: ${warnings}\x1b[0m`)
    } else {
      console.log(`\x1b[90m   Warnings: ${warnings}\x1b[0m`)
    }
    console.log('')

    if (failed > 0) {
      console.log('\x1b[31m\x1b[1m💥 QA FAILED - Issues detected in pack generation\x1b[0m')
    } else if (warnings > 0) {
      console.log('\x1b[33m\x1b[1m⚠️  QA PASSED with warnings - Review recommended\x1b[0m')
    } else {
      console.log('\x1b[32m\x1b[1m🎉 QA PASSED - Pack generation looks good!\x1b[0m')
    }
  }

  return results
}

// Export for use in API
export async function runAllTests(): Promise<TestResult[]> {
  return await runQA(true)
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runQA().then(results => {
    // Write results to file
    const outputPath = join(__dirname, 'results.json')
    const output = {
      runAt: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length
      },
      tests: results
    }

    writeFileSync(outputPath, JSON.stringify(output, null, 2))
    console.log(`\n📄 Results written to: ${outputPath}`)

    const failed = results.filter(r => r.status === 'failed').length
    if (failed > 0) {
      process.exit(1)
    }
  }).catch(err => {
    console.error('QA runner failed:', err)
    process.exit(1)
  })
}
