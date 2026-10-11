// @ts-nocheck
/**
 * Set7PlusUc3OutcomeBelt Tests
 *
 * Run with: npx tsx src/belts/Set7PlusUc3OutcomeBelt.test.ts
 */

import { Set7PlusUc3OutcomeBelt } from './Set7PlusUc3OutcomeBelt'
import { HyperspaceSingleRarityBelt } from './HyperspaceSingleRarityBelt'
import { initializeCardCache } from '../utils/cardCache'
import { ASH_CONFIG } from '../utils/setConfigs/ASH'

function binomCdf(k: number, n: number, p: number): number {
  let sum = 0, term = Math.pow(1 - p, n)
  for (let i = 0; i <= k; i++) {
    sum += term
    term = term * (n - i) / (i + 1) * p / (1 - p)
  }
  return Math.min(1, sum)
}

/** Exact (Clopper-Pearson) two-sided confidence interval for k successes in n. */
function clopperPearson(k: number, n: number, alpha: number): [number, number] {
  const solve = (f: (p: number) => number) => {
    let a = 0, b = 1
    for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m }
    return (a + b) / 2
  }
  // lower: P(X >= k | p) = alpha/2 ; upper: P(X <= k | p) = alpha/2
  const lo = k === 0 ? 0 : solve(p => alpha / 2 - (1 - binomCdf(k - 1, n, p)))
  const hi = k === n ? 1 : solve(p => binomCdf(k, n, p) - alpha / 2)
  return [lo, hi]
}

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`✗ ${name}`)
    console.log(`  ${(e as Error).message}`)
    failed++
  }
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

async function runTests(): Promise<void> {
  console.log('Initializing card cache...')
  await initializeCardCache()

  console.log('')
  console.log('Set7PlusUc3OutcomeBelt Tests')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('outcome belt emits exact cycle counts', () => {
    const belt = new Set7PlusUc3OutcomeBelt()
    const counts: Record<string, number> = {}

    for (let i = 0; i < 2160; i++) {
      const outcome = belt.next()
      counts[outcome] = (counts[outcome] || 0) + 1
    }

    assertEqual(counts.none, 1360, 'none count should be exact')
    assertEqual(counts.prestige, 120, 'prestige count should be exact')
    assertEqual(counts.hsUncommon, 408, 'hsUncommon count should be exact')
    assertEqual(counts.hsRare, 204, 'hsRare count should be exact')
    assertEqual(counts.hsSpecial, 51, 'hsSpecial count should be exact')
    assertEqual(counts.hsLegendary, 17, 'hsLegendary count should be exact')
  })

  test('outcome belt honors a custom prestige rate (mechanism)', () => {
    // The belt supports an arbitrary per-set prestige rate; exact cycle counts
    // must track it. (ASH itself now runs the 1/18 default — see the sheet-cut
    // test below — this only checks the rate plumbing.)
    const belt = new Set7PlusUc3OutcomeBelt({ prestigeRate: 1 / 12 })
    const counts: Record<string, number> = {}

    for (let i = 0; i < 2160; i++) {
      const outcome = belt.next()
      counts[outcome] = (counts[outcome] || 0) + 1
    }

    assertEqual(counts.none, 1300, 'none count should adjust for the custom rate')
    assertEqual(counts.prestige, 180, 'prestige count should be 1/12 of the cycle')
    assertEqual(counts.hsUncommon, 408, 'hsUncommon count should stay LAW-shaped')
    assertEqual(counts.hsRare, 204, 'hsRare count should stay LAW-shaped')
    assertEqual(counts.hsSpecial, 51, 'hsSpecial count should stay LAW-shaped')
    assertEqual(counts.hsLegendary, 17, 'hsLegendary count should stay LAW-shaped')
  })

  // ---- Prestige per 24-pack box (ASH) -------------------------------------
  // SPEC: ASH tier-1 prestige rate is ASH_CONFIG.upgradeProbabilities.uc3ToPrestige
  // (1/22), encoded exactly as round(2160 * rate) per 2160-pack cycle. Real boxes
  // (data/real-boxes/ash-box-001..011, prestige = variant "Prestige" or number
  // 785-925): 1,1,1,2,2,1,1,0,1,0,0 → 12 in 11 boxes, and THREE boxes (008, 010,
  // 011) held none. A per-box floor of 1 or cap of 2 is an order statistic of 11
  // boxes, not a rule — so neither is asserted here.
  //
  // Each box is drawn from a FRESH belt, mirroring generateSealedBox (which
  // clears every belt per box).
  const ASH_PRESTIGE_RATE = ASH_CONFIG.upgradeProbabilities.uc3ToPrestige
  const PACKS_PER_BOX = 24
  const prestigePerBox = (boxes: number): number[] => {
    const out: number[] = []
    for (let b = 0; b < boxes; b++) {
      const belt = new Set7PlusUc3OutcomeBelt({ prestigeRate: ASH_PRESTIGE_RATE })
      let count = 0
      for (let p = 0; p < PACKS_PER_BOX; p++) if (belt.next() === 'prestige') count++
      out.push(count)
    }
    return out
  }

  test('SPEC: ASH mean prestige per box matches the configured rate (±4σ)', () => {
    const BOXES = 2000
    const perPack = Math.round(2160 * ASH_PRESTIGE_RATE) / 2160
    const expected = PACKS_PER_BOX * perPack
    // Binomial σ per box is the WIDEST plausible spread (a spaced sheet is
    // sub-binomial), so this band is conservative.
    const sigmaMean = Math.sqrt(PACKS_PER_BOX * perPack * (1 - perPack) / BOXES)
    const counts = prestigePerBox(BOXES)
    const mean = counts.reduce((a, b) => a + b, 0) / BOXES
    console.log(`  prestige/box mean ${mean.toFixed(3)} (expected ${expected.toFixed(3)} ± ${(4 * sigmaMean).toFixed(3)})`)
    assert(Math.abs(mean - expected) <= 4 * sigmaMean,
      `SPEC: mean prestige/box ${mean.toFixed(3)} outside ${expected.toFixed(3)} ± ${(4 * sigmaMean).toFixed(3)}`)
  })

  // Zero-prestige boxes must stay consistent with the TREATMENT-VERIFIED real
  // boxes. Boxes 008-011 were title-read (~97% 'Unverified' rows, ~2 fewer
  // variant cards per six than 001-007), so a prestige read by title alone
  // drops out — their "0 prestige" (008, 010, 011) is not evidence. The
  // number-verified boxes 001-007 held 1,1,1,2,2,1,1: zero empty boxes in 7.
  // An independent 1/22 coin would leave ~33% of boxes empty (P(0 of 7) ≈ 6%);
  // the spaced sheet leaves ~2%. Transcribe a verified empty box and this
  // count changes — do not edit it from title-read boxes.
  test('SPEC: zero-prestige box share is consistent with the verified real boxes (0 of 7)', () => {
    const BOXES = 400
    const REAL_ZERO = 0, REAL_BOXES = 7
    const [lo, hi] = clopperPearson(REAL_ZERO, REAL_BOXES, 0.05)
    const genSigma = (p: number) => Math.sqrt(p * (1 - p) / BOXES)
    const upper = hi + 2 * genSigma(hi)
    const counts = prestigePerBox(BOXES)
    const zeroShare = counts.filter(c => c === 0).length / BOXES
    console.log(`  zero-prestige boxes ${(100 * zeroShare).toFixed(1)}% (verified real ${REAL_ZERO}/${REAL_BOXES}, 95% CI ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}%)`)
    assert(zeroShare >= lo && zeroShare <= upper,
      `SPEC: zero-prestige share ${(100 * zeroShare).toFixed(1)}% outside ${(100 * lo).toFixed(1)}-${(100 * upper).toFixed(1)}% (Clopper-Pearson 95% of ${REAL_ZERO}/${REAL_BOXES})`)
  })

  test('outcome belt refills after one cycle', () => {
    const belt = new Set7PlusUc3OutcomeBelt()
    for (let i = 0; i < 2160; i++) belt.next()
    const next = belt.next()
    assert(!!next, 'belt should refill after cycle is exhausted')
  })

  console.log('')
  console.log('HyperspaceSingleRarityBelt Tests')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('rare belt initializes with only rares', () => {
    const belt = new HyperspaceSingleRarityBelt('LAW', 'Rare')
    assert(belt.fillingPool.length > 0, 'filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.rarity === 'Rare'), 'all cards should be Rare')
    assert(belt.fillingPool.every(c => !c.isLeader && !c.isBase), 'no leaders or bases')
  })

  test('special belt returns special cards', () => {
    const belt = new HyperspaceSingleRarityBelt('LAW', 'Special')
    const card = belt.next()
    assert(!!card, 'should draw a card')
    assertEqual(card.rarity, 'Special', 'drawn card should be Special')
    assert(card.isHyperspace === true, 'drawn card should be hyperspace-marked')
  })

  test('legendary belt returns legendary cards', () => {
    const belt = new HyperspaceSingleRarityBelt('LAW', 'Legendary')
    const card = belt.next()
    assert(!!card, 'should draw a card')
    assertEqual(card.rarity, 'Legendary', 'drawn card should be Legendary')
    assert(card.isHyperspace === true, 'drawn card should be hyperspace-marked')
  })

  console.log('')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
    process.exit(1)
  }
  console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m')
}

runTests()
