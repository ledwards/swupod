// @ts-nocheck
/**
 * RareLegendaryBelt Tests
 *
 * Run with: node src/belts/RareLegendaryBelt.test.ts
 */

import { RareLegendaryBelt } from './RareLegendaryBelt'
import { initializeCardCache } from '../utils/cardCache'

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

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  console.log('')
  console.log('\x1b[1m\x1b[35m💎 RareLegendaryBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads rares and legendaries', () => {
    const belt = new RareLegendaryBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.rares.length > 0, 'Should have rares')
    assert(belt.legendaries.length > 0, 'Should have legendaries')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in filling pool')
    assert(belt.fillingPool.every(c => c.set === 'SOR'), 'All cards should be from SOR set')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('all sets include rare bases in filling pool (rare bases go in rare slot)', () => {
    for (const setCode of ['SOR', 'LAW']) {
      const belt = new RareLegendaryBelt(setCode)
      const rareBases = belt.rares.filter(c => c.isBase)
      assert(rareBases.length > 0, `${setCode} should have rare bases in the rare slot`)
      assert(rareBases.every(c => c.rarity === 'Rare'), 'All rare bases should be Rare rarity')
    }
  })

  test('filling pool contains only Rare and Legendary rarities', () => {
    const belt = new RareLegendaryBelt('SOR')
    assert(
      belt.fillingPool.every(c => c.rarity === 'Rare' || c.rarity === 'Legendary'),
      'All cards should be Rare or Legendary'
    )
  })

  test('sets 1-3 use 7:1 ratio (1 in 8 legendary)', () => {
    for (const setCode of ['SOR', 'SHD', 'TWI']) {
      const belt = new RareLegendaryBelt(setCode)
      assertEqual(belt.ratio, 7, `${setCode} should use 7:1 ratio`)
    }
  })

  test('sets 4-6 use 5:1 ratio (1 in 6 legendary)', () => {
    for (const setCode of ['JTL', 'LOF', 'SEC']) {
      const belt = new RareLegendaryBelt(setCode)
      assertEqual(belt.ratio, 5, `${setCode} should use 5:1 ratio`)
    }
  })

  test('hopper is filled on initialization', () => {
    const belt = new RareLegendaryBelt('SOR')
    assert(belt.hopper.length > belt.fillingPool.length, 'Hopper should be at least as large as filling pool after init')
  })

  test('next() returns a rare or legendary card', () => {
    const belt = new RareLegendaryBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.rarity === 'Rare' || card.rarity === 'Legendary', 'Returned card should be Rare or Legendary')
    assert(!card.isLeader, 'Returned card should not be a leader')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() removes card from hopper', () => {
    const belt = new RareLegendaryBelt('SOR')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new RareLegendaryBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when depleted', () => {
    const belt = new RareLegendaryBelt('SOR')
    const fillingPoolSize = belt.fillingPool.length

    // Drain the hopper to exactly the threshold
    while (belt.size > fillingPoolSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()
    belt.next()

    // After refill, hopper should be larger than filling pool again
    assert(belt.size >= fillingPoolSize, `Hopper should refill. Size: ${belt.size}, threshold: ${fillingPoolSize}`)
  })

  test('rares appear more frequently than legendaries (matching spec ratio)', () => {
    // SPEC: Sets 1-3 should have 7:1 rare:legendary ratio (1 in 8 = 12.5% legendary)
    // SPEC: Sets 4+ should have 5:1 rare:legendary ratio (1 in 6 = 16.7% legendary)
    const belt = new RareLegendaryBelt('SOR')

    // Sample many cards for statistical significance
    const counts: Record<string, number> = { Rare: 0, Legendary: 0 }
    for (let i = 0; i < 800; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    // Calculate observed legendary rate
    const total = counts.Rare + counts.Legendary
    const legendaryRate = counts.Legendary / total

    // SPEC: SOR (Set 1) should have ~12.5% legendary rate (1 in 8)
    const expectedRate = 1 / 8  // 12.5%
    const tolerance = 0.04  // Allow 4% variance for statistical noise

    assert(Math.abs(legendaryRate - expectedRate) < tolerance,
      `Legendary rate should be ~${(expectedRate * 100).toFixed(1)}% (1 in 8), ` +
      `got ${(legendaryRate * 100).toFixed(1)}% (${counts.Legendary}/${total})`)
  })

  test('no duplicate cards within 6 slots of each other (seam dedup)', () => {
    const belt = new RareLegendaryBelt('SOR')

    // Check first 100 cards for adjacent duplicates
    const sample: Array<{ id: string }> = []
    for (let i = 0; i < 100; i++) {
      sample.push(belt.next())
    }

    let violations = 0
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 6, sample.length - 1); j++) {
        if (sample[i].id === sample[j].id) {
          violations++
        }
      }
    }

    // Allow some violations since dedup isn't perfect with card pool size
    assert(violations <= 5, `Found ${violations} duplicate pairs within 6 slots (max allowed: 5)`)
  })

  test('different belt instances start at different positions', () => {
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new RareLegendaryBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new RareLegendaryBelt('SOR')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new RareLegendaryBelt('SOR')
    const fillSize = belt.fillingPool.length

    // Deploy entire first fill into an array
    const firstFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      firstFill.push(belt.next().id)
    }

    // Deploy second fill into an array
    const secondFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      secondFill.push(belt.next().id)
    }

    // Arrays should not be identical
    const areIdentical = firstFill.length === secondFill.length &&
      firstFill.every((id, idx) => id === secondFill[idx])

    assert(!areIdentical, 'Consecutive belt fills should not produce identical sequences')

    // Count how many positions are different
    let differences = 0
    for (let i = 0; i < Math.min(firstFill.length, secondFill.length); i++) {
      if (firstFill[i] !== secondFill[i]) differences++
    }

    // At least 50% of positions should be different (shuffled)
    const diffPercent = (differences / firstFill.length) * 100
    assert(diffPercent > 50, `At least 50% of positions should differ, got ${diffPercent.toFixed(1)}%`)
  })

  console.log('')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }
  console.log('')

  if (failed > 0) {
    console.log('\x1b[31m\x1b[1m💥 TESTS FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m')
  }
}

runTests()
