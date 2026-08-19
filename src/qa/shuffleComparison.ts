/**
 * Shuffle vs Sequential Pack Comparison Test
 *
 * Compares duplicate rates between:
 * 1. Sequential packs (no shuffle) - packs 0-5 from a box
 * 2. Random 6 packs from 24 (single box shuffle)
 * 3. Random 6 packs from 72 (multi-box shuffle - 3 boxes)
 *
 * ANALYSIS SCRIPT, NOT A TEST — it makes no assertions and takes ~6 minutes, so it
 * is deliberately not part of `npm run qa`. Named without `.test.ts` (like
 * duplicateAnalysis.ts) so it is not mistaken for an orphaned suite.
 *
 * Run with: npx tsx src/qa/shuffleComparison.ts
 */

import { generateSealedBox, generateBoosterPack, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

const SAMPLE_SIZE = 200 // Number of pools to generate per scenario
const PACKS_PER_POOL = 6

interface Card {
  id: string
  name: string
  variantType?: string
  isFoil?: boolean
  isLeader?: boolean
  isBase?: boolean
  isHyperspace?: boolean
  rarity?: string
}

interface Pack {
  cards: Card[]
}

/**
 * Get key for deduplication - same card name with same treatment counts as duplicate
 */
function getCardKey(card: Card): string {
  const variant = card.variantType || 'Normal'
  const foilSuffix = card.isFoil ? '-Foil' : ''
  return `${card.name}-${variant}${foilSuffix}`
}

/**
 * Count duplicates and triplicates in a pool
 */
function countDuplicates(cards: Card[]): { duplicates: number; triplicates: number; quadruplicates: number } {
  const counts = new Map<string, number>()

  cards.forEach(card => {
    // Skip leaders and bases - focus on main deck cards
    if (card.isLeader || card.isBase) return
    const key = getCardKey(card)
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  let duplicates = 0
  let triplicates = 0
  let quadruplicates = 0

  counts.forEach(count => {
    if (count >= 2) duplicates++
    if (count >= 3) triplicates++
    if (count >= 4) quadruplicates++
  })

  return { duplicates, triplicates, quadruplicates }
}

/**
 * Generate N unique random indices from 0 to max-1
 */
function generateRandomIndices(count: number, max: number): number[] {
  const indices: number[] = []
  const available = Array.from({ length: max }, (_, i) => i)

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length)
    indices.push(available[randomIndex]!)  // randomIndex is drawn from available.length
    available.splice(randomIndex, 1)
  }

  return indices.sort((a, b) => a - b)
}

interface ScenarioStats {
  name: string
  duplicates: { mean: number; stdDev: number; min: number; max: number }
  triplicates: { mean: number; stdDev: number; min: number; max: number }
  quadruplicates: { mean: number; stdDev: number; min: number; max: number }
  poolsWithTriplicates: number
  poolsWithQuadruplicates: number
}

function calculateStats(values: number[]): { mean: number; stdDev: number; min: number; max: number } {
  const n = values.length
  const mean = values.reduce((sum, val) => sum + val, 0) / n
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n
  const stdDev = Math.sqrt(variance)
  return { mean, stdDev, min: Math.min(...values), max: Math.max(...values) }
}

async function runScenario(
  name: string,
  generatePool: () => Pack[]
): Promise<ScenarioStats> {
  const duplicateCounts: number[] = []
  const triplicateCounts: number[] = []
  const quadruplicateCounts: number[] = []

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const packs = generatePool()
    const allCards = packs.flatMap(p => p.cards)
    const { duplicates, triplicates, quadruplicates } = countDuplicates(allCards)
    duplicateCounts.push(duplicates)
    triplicateCounts.push(triplicates)
    quadruplicateCounts.push(quadruplicates)
  }

  return {
    name,
    duplicates: calculateStats(duplicateCounts),
    triplicates: calculateStats(triplicateCounts),
    quadruplicates: calculateStats(quadruplicateCounts),
    poolsWithTriplicates: triplicateCounts.filter(c => c > 0).length,
    poolsWithQuadruplicates: quadruplicateCounts.filter(c => c > 0).length,
  }
}

async function runComparison() {
  console.log('\x1b[1m\x1b[36m📊 Shuffle vs Sequential Pack Comparison\x1b[0m')
  console.log('\x1b[36m==========================================\x1b[0m')
  console.log(`Sample size: ${SAMPLE_SIZE} pools per scenario`)
  console.log(`Packs per pool: ${PACKS_PER_POOL}`)
  console.log('')

  console.log('Initializing card cache...')
  await initializeCardCache()

  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

  for (const setCode of sets) {
    console.log('')
    console.log(`\x1b[1m\x1b[35m=== ${setCode} ===\x1b[0m`)

    const cards = getCachedCards(setCode)
    if (cards.length === 0) {
      console.log(`Skipping ${setCode} - no card data`)
      continue
    }

    // Scenario 1: Sequential packs (no shuffle)
    console.log('Running: Sequential (no shuffle)...')
    const sequential = await runScenario('Sequential (packs 0-5)', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      return box.slice(0, PACKS_PER_POOL)
    })

    // Scenario 2: Random 6 from 24 (single box shuffle)
    console.log('Running: Single box shuffle (6 from 24)...')
    const singleBox = await runScenario('Single Box (6 random from 24)', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      const indices = generateRandomIndices(PACKS_PER_POOL, 24)
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Scenario 3: Random 6 from 72 (multi-box shuffle - RESETS belts between boxes)
    console.log('Running: Multi-box shuffle (6 from 72, belt resets)...')
    const multiBox = await runScenario('Multi-Box RESET (6 from 72)', () => {
      // Generate 3 boxes with belt resets between each (inline, function was removed)
      const allPacks: Pack[] = []
      for (let box = 0; box < 3; box++) {
        clearBeltCache()
        for (let i = 0; i < 24; i++) {
          allPacks.push(generateBoosterPack(cards, setCode))
        }
      }
      const indices = generateRandomIndices(PACKS_PER_POOL, 72)
      return indices.map(i => allPacks[i]!)  // indices are bounded by allPacks.length
    })

    // Scenario 4: Random 6 from 72 (continuous belt - NO resets)
    console.log('Running: Continuous belt (6 from 72, no resets)...')
    const continuous = await runScenario('Continuous Belt (6 from 72)', () => {
      clearBeltCache()
      // Generate all 72 packs with ONE continuous belt run - no resets
      const allPacks: Pack[] = []
      for (let i = 0; i < 72; i++) {
        allPacks.push(generateBoosterPack(cards, setCode))
      }
      const indices = generateRandomIndices(PACKS_PER_POOL, 72)
      return indices.map(i => allPacks[i]!)  // indices are bounded by allPacks.length
    })

    // Scenario 5: Stratified random from 24 (pick 1 from each zone of 4)
    console.log('Running: Stratified random (1 per zone of 4)...')
    const stratified = await runScenario('Stratified (1 per 4-pack zone)', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      // Pick 1 random pack from each zone: [0-3], [4-7], [8-11], [12-15], [16-19], [20-23]
      const indices: number[] = []
      for (let zone = 0; zone < 6; zone++) {
        const zoneStart = zone * 4
        const pick = zoneStart + Math.floor(Math.random() * 4)
        indices.push(pick)
      }
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Scenario 6: Random start, sequential picks (preserves adjacency)
    console.log('Running: Random start sequential (6 adjacent from random start)...')
    const randomStart = await runScenario('Random Start Sequential', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      // Pick random starting position (0-18), then take 6 sequential packs
      const start = Math.floor(Math.random() * 19) // 0-18 so we can fit 6 packs
      const indices = [start, start+1, start+2, start+3, start+4, start+5]
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Scenario 7: 3+3 with gap (random start, 3 sequential, skip some, 3 more)
    console.log('Running: 3+3 with gap...')
    const threeAndThree = await runScenario('3+3 with gap', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      // Pick random start for first group, then random start for second group
      const start1 = Math.floor(Math.random() * 10) // 0-9
      const start2 = 12 + Math.floor(Math.random() * 10) // 12-21
      const indices = [start1, start1+1, start1+2, start2, start2+1, start2+2]
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Scenario 8: 2+2+2 with gaps
    console.log('Running: 2+2+2 with gaps...')
    const twoTwoTwo = await runScenario('2+2+2 with gaps', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      // Three groups of 2, spread across the box
      const start1 = Math.floor(Math.random() * 6) // 0-5
      const start2 = 8 + Math.floor(Math.random() * 6) // 8-13
      const start3 = 16 + Math.floor(Math.random() * 7) // 16-22
      const indices = [start1, start1+1, start2, start2+1, start3, start3+1]
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Scenario 9: Every other pack (skip 1 between each)
    console.log('Running: Every other pack (skip 1)...')
    const everyOther = await runScenario('Every other (skip 1)', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      // Start random, take every other pack
      const start = Math.floor(Math.random() * 13) // 0-12 so we fit 6 with gaps
      const indices = [start, start+2, start+4, start+6, start+8, start+10]
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Scenario 10: Skip 2 between each pack
    console.log('Running: Skip 2 between each...')
    const skipTwo = await runScenario('Skip 2 between each', () => {
      clearBeltCache()
      const box = generateSealedBox(cards, setCode, 24)
      // Start random, skip 2 between each
      const start = Math.floor(Math.random() * 9) // 0-8 so we fit 6 with gaps
      const indices = [start, start+3, start+6, start+9, start+12, start+15]
      return indices.map(i => box[i]!)  // indices are bounded by the box size
    })

    // Print results
    console.log('')
    console.log('\x1b[36mResults:\x1b[0m')
    console.log('')
    console.log('┌─────────────────────────────┬──────────────────┬──────────────────┬──────────────────┐')
    console.log('│ Scenario                    │ Duplicates       │ Triplicates      │ Quadruplicates   │')
    console.log('├─────────────────────────────┼──────────────────┼──────────────────┼──────────────────┤')

    for (const scenario of [sequential, randomStart, threeAndThree, twoTwoTwo, everyOther, skipTwo, singleBox, stratified, multiBox, continuous]) {
      const dupStr = `${scenario.duplicates.mean.toFixed(2)}±${scenario.duplicates.stdDev.toFixed(2)} [${scenario.duplicates.min}-${scenario.duplicates.max}]`
      const tripStr = `${scenario.triplicates.mean.toFixed(2)}±${scenario.triplicates.stdDev.toFixed(2)} [${scenario.triplicates.min}-${scenario.triplicates.max}]`
      const quadStr = `${scenario.quadruplicates.mean.toFixed(2)}±${scenario.quadruplicates.stdDev.toFixed(2)} [${scenario.quadruplicates.min}-${scenario.quadruplicates.max}]`

      console.log(`│ ${scenario.name.padEnd(27)} │ ${dupStr.padEnd(16)} │ ${tripStr.padEnd(16)} │ ${quadStr.padEnd(16)} │`)
    }

    console.log('└─────────────────────────────┴──────────────────┴──────────────────┴──────────────────┘')

    // Target rates from research: 10-15 duplicates, 20-30% pools with triplicates
    console.log('')
    console.log('\x1b[33m📊 TARGET: 10-15 duplicates, 20-30% pools with triplicates\x1b[0m')

    const allScenarios = [
      sequential, randomStart, threeAndThree, twoTwoTwo, everyOther, skipTwo,
      singleBox, stratified, multiBox, continuous
    ]

    console.log('')
    console.log('Pools with triplicates (target: 20-30%):')
    for (const s of allScenarios) {
      const pct = (s.poolsWithTriplicates/SAMPLE_SIZE*100).toFixed(1)
      const inRange = s.poolsWithTriplicates/SAMPLE_SIZE >= 0.20 && s.poolsWithTriplicates/SAMPLE_SIZE <= 0.30
      const marker = inRange ? '✓' : ' '
      console.log(`  ${marker} ${s.name.padEnd(26)} ${s.poolsWithTriplicates}/${SAMPLE_SIZE} (${pct}%)`)
    }

    console.log('')
    console.log('Pools with quadruplicates (target: ~5-10%):')
    for (const s of allScenarios) {
      const pct = (s.poolsWithQuadruplicates/SAMPLE_SIZE*100).toFixed(1)
      console.log(`    ${s.name.padEnd(26)} ${s.poolsWithQuadruplicates}/${SAMPLE_SIZE} (${pct}%)`)
    }

    // Find best match to target
    console.log('')
    console.log('\x1b[32mClosest to target (10-15 dupes, 20-30% trips):\x1b[0m')
    const ranked = allScenarios
      .map(s => {
        const dupScore = Math.abs(s.duplicates.mean - 12.5) // target midpoint 12.5
        const tripScore = Math.abs(s.poolsWithTriplicates/SAMPLE_SIZE - 0.25) * 50 // target 25%
        return { name: s.name, score: dupScore + tripScore, dup: s.duplicates.mean, trip: s.poolsWithTriplicates/SAMPLE_SIZE }
      })
      .sort((a, b) => a.score - b.score)

    for (const r of ranked.slice(0, 3)) {
      console.log(`  ${r.name}: ${r.dup.toFixed(1)} dupes, ${(r.trip*100).toFixed(1)}% trips`)
    }
  }

  console.log('')
  console.log('\x1b[32m\x1b[1mComparison complete!\x1b[0m')
}

runComparison().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
