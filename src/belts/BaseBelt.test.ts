// @ts-nocheck
/**
 * BaseBelt Tests
 *
 * Run with: node src/belts/BaseBelt.test.ts
 */

import { BaseBelt } from './BaseBelt'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

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
  console.log('\x1b[1m\x1b[35m🏛️ BaseBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads only common bases', () => {
    const belt = new BaseBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.isBase), 'All cards in filling pool should be bases')
    assert(belt.fillingPool.every(c => c.rarity === 'Common'), 'All bases should be Common rarity')
    assert(belt.fillingPool.every(c => c.set === 'SOR'), 'All cards should be from SOR set')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('hopper is filled on initialization', () => {
    const belt = new BaseBelt('SOR')
    assert(belt.hopper.length >= belt.fillingPool.length, 'Hopper should be at least as large as filling pool after init')
  })

  test('next() returns a base card', () => {
    const belt = new BaseBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isBase, 'Returned card should be a base')
    assert(card.rarity === 'Common', 'Returned card should be Common rarity')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() removes card from hopper when serving common', () => {
    // Use SHD which has no rare bases, so next() always serves from hopper
    const belt = new BaseBelt('SHD')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new BaseBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    // Get another card and check it doesn't have the modification
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when depleted', () => {
    const belt = new BaseBelt('SOR')
    const fillingPoolSize = belt.fillingPool.length

    // Drain the hopper to exactly the threshold
    while (belt.size > fillingPoolSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()

    // After refill, hopper should be at least as large as filling pool (with < instead of <=, it refills to exactly filling pool size)
    assert(belt.size >= fillingPoolSize, `Hopper should refill. Size: ${belt.size}, threshold: ${fillingPoolSize}`)
  })

  test('adjacent bases rarely have the same aspect (seam dedup)', () => {
    const belt = new BaseBelt('SOR')

    // Sample 50 cards and check for adjacent aspect matches
    const sample: Array<{ aspects?: string[] }> = []
    for (let i = 0; i < 50; i++) {
      sample.push(belt.next())
    }

    let adjacentMatches = 0
    for (let i = 1; i < sample.length; i++) {
      const prev = sample[i - 1]
      const curr = sample[i]
      if (prev.aspects && curr.aspects) {
        const hasOverlap = prev.aspects.some(a => curr.aspects!.includes(a))
        if (hasOverlap) {
          adjacentMatches++
        }
      }
    }

    // With 8 bases and aspect dedup, we should have few adjacent matches
    // Allow some since dedup isn't perfect
    assert(adjacentMatches <= 10, `Found ${adjacentMatches} adjacent aspect matches (max allowed: 10)`)
  })

  test('different belt instances start at different positions', () => {
    // Create multiple belts and check their first card varies
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new BaseBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new BaseBelt('SOR')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('all bases have aspects', () => {
    const belt = new BaseBelt('SOR')
    // Check filling pool has aspects
    assert(belt.fillingPool.every(c => c.aspects && c.aspects.length > 0), 'All bases should have aspects')
  })

  test('no set loads rare bases into the base slot (all use rare slot)', () => {
    // All sets (1-7) have rareBasesInRareSlot: true → rare bases go in RareLegendaryBelt
    for (const setCode of ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']) {
      const belt = new BaseBelt(setCode)
      assertEqual(belt.rareBases.length, 0, `${setCode} should NOT have rare bases in base slot (they go in rare slot)`)
    }
  })

  test('base slot only serves common bases for all sets', () => {
    for (const setCode of ['SOR', 'LAW']) {
      const belt = new BaseBelt(setCode)
      for (let i = 0; i < 100; i++) {
        const card = belt.next()
        assert(card !== null, `${setCode} next() should return a card`)
        assertEqual(card.rarity, 'Common', `${setCode} base slot should only serve common bases, got ${card.rarity}`)
      }
    }
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new BaseBelt('SOR')
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
    // Use >= to avoid flaky failures at exactly 50% (common with small pools like 8 bases)
    const diffPercent = (differences / firstFill.length) * 100
    assert(diffPercent >= 50, `At least 50% of positions should differ, got ${diffPercent.toFixed(1)}%`)
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
