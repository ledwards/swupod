// @ts-nocheck
/**
 * Set7PlusUc3OutcomeBelt Tests
 *
 * Run with: npx tsx src/belts/Set7PlusUc3OutcomeBelt.test.ts
 */

import { Set7PlusUc3OutcomeBelt } from './Set7PlusUc3OutcomeBelt'
import { HyperspaceSingleRarityBelt } from './HyperspaceSingleRarityBelt'
import { initializeCardCache } from '../utils/cardCache'

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

  test('FIXED: prestige is sheet-cut spaced — every 24-pack box gets 1-2, never 3+', () => {
    // SPEC (11 real ASH boxes): prestige per 24-pack box is 1-2, max 2 ever,
    // ~1/3 of boxes carry a second (mean ~1.3 = 1/18). The OLD shuffled hopper
    // produced Binomial(24, 1/18) variance and clustered 3-4/box a few % of the
    // time — the DD "4 in a box" report. Placement must ration prestige so no
    // 24-pack window clusters.
    const belt = new Set7PlusUc3OutcomeBelt() // default 1/18
    const BOXES = 3000
    let minCount = Infinity
    let maxCount = 0
    let boxesWithTwo = 0
    for (let b = 0; b < BOXES; b++) {
      let count = 0
      for (let p = 0; p < 24; p++) {
        if (belt.next() === 'prestige') count++
      }
      if (count < minCount) minCount = count
      if (count > maxCount) maxCount = count
      if (count === 2) boxesWithTwo++
    }
    assert(maxCount <= 2, `SPEC: no box may exceed 2 prestige, saw ${maxCount}`)
    assert(minCount >= 1, `SPEC: every box should carry >=1 prestige, saw ${minCount}`)
    const twoRate = boxesWithTwo / BOXES
    assert(twoRate > 0.15 && twoRate < 0.5,
      `SPEC: ~1/3 of boxes carry a 2nd prestige (1 + 1/3 = 1/18), got ${twoRate.toFixed(3)}`)
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
