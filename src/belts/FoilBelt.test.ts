// @ts-nocheck
/**
 * FoilBelt Tests
 *
 * Run with: node src/belts/FoilBelt.test.ts
 */

import { FoilBelt } from './FoilBelt'
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
  console.log('\x1b[1m\x1b[35m✨ FoilBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with a set code and loads non-leader, non-base cards', () => {
    const belt = new FoilBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in filling pool')
    assert(belt.fillingPool.every(c => !c.isBase), 'No bases in filling pool')
    assert(belt.fillingPool.every(c => c.set === 'SOR'), 'All cards should be from SOR set')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('hopper is filled on initialization', () => {
    const belt = new FoilBelt('SOR')
    assert(belt.hopper.length > 0, 'Hopper should not be empty after init')
  })

  test('next() returns a foil card', () => {
    const belt = new FoilBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isFoil === true, 'Returned card should be marked as foil')
    assert(!card.isLeader, 'Returned card should not be a leader')
    assert(!card.isBase, 'Returned card should not be a base')
    assert(card.set === 'SOR', 'Returned card should be from correct set')
  })

  test('next() removes card from hopper', () => {
    const belt = new FoilBelt('SOR')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new FoilBelt('SOR')
    const card1 = belt.next()
    card1.modified = true
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when depleted', () => {
    const belt = new FoilBelt('SOR')

    // Get the boot size
    const bootSize = belt._calculateBootSize()

    // Drain the hopper to below threshold
    while (belt.size > bootSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()
    belt.next()

    // After refill, hopper should be larger than boot size
    assert(belt.size >= bootSize, `Hopper should refill. Size: ${belt.size}, threshold: ${bootSize}`)
  })

  test('commons appear most frequently in hopper', () => {
    const belt = new FoilBelt('SOR')

    // Sample many cards
    const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 }
    for (let i = 0; i < 500; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    // Commons (54x) should appear more than uncommons (18x)
    // Uncommons should appear more than rares (6x)
    // Rares should appear more than legendaries (1x)
    assert(counts.Common > counts.Uncommon,
      `Commons (${counts.Common}) should appear more than uncommons (${counts.Uncommon})`)
    assert(counts.Uncommon > counts.Rare,
      `Uncommons (${counts.Uncommon}) should appear more than rares (${counts.Rare})`)
    assert(counts.Rare > counts.Legendary,
      `Rares (${counts.Rare}) should appear more than legendaries (${counts.Legendary})`)
  })

  test('rarity distribution matches target percentages from packConstants', () => {
    // SPEC from packConstants: Sets 1-3 target foil slot weights:
    // - Common: 78%
    // - Uncommon: 17%
    // - Rare: 5%
    // - Legendary: 0.3%
    // Belt dynamically calculates multipliers to achieve these targets
    const belt = new FoilBelt('SOR')

    // Sample a large number of cards
    const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Special: 0 }
    const sampleSize = 2000
    for (let i = 0; i < sampleSize; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    const total = counts.Common + counts.Uncommon + counts.Rare + counts.Legendary
    const commonPct = (counts.Common / total) * 100
    const uncommonPct = (counts.Uncommon / total) * 100
    const rarePct = (counts.Rare / total) * 100

    // Target: Common ~78%, allow ±10% tolerance
    assert(commonPct > 65 && commonPct < 90,
      `Common should be ~78%, got ${commonPct.toFixed(1)}%`)

    // Target: Uncommon ~17%, allow ±8% tolerance
    assert(uncommonPct > 9 && uncommonPct < 25,
      `Uncommon should be ~17%, got ${uncommonPct.toFixed(1)}%`)

    // Target: Rare ~5%, allow ±4% tolerance
    assert(rarePct > 1 && rarePct < 10,
      `Rare should be ~5%, got ${rarePct.toFixed(1)}%`)
  })

  test('different belt instances start at different positions', () => {
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new FoilBelt('SOR')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random start, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new FoilBelt('SOR')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peeked cards are marked as foil
    assert(peeked.every(c => c.isFoil), 'Peeked cards should be marked as foil')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('all cards in filling pool have valid rarities', () => {
    const belt = new FoilBelt('SOR')
    const validRarities = ['Common', 'Uncommon', 'Rare', 'Legendary']
    assert(
      belt.fillingPool.every(c => validRarities.includes(c.rarity)),
      'All cards should have valid rarities (no Special for sets 1-3)'
    )
  })

  test('sets 1-3 exclude Special rarity from foil pool', () => {
    // SOR is set 1, SHD is set 2, TWI is set 3
    for (const setCode of ['SOR', 'SHD', 'TWI']) {
      const belt = new FoilBelt(setCode)
      const hasSpecial = belt.fillingPool.some(c => c.rarity === 'Special')
      assert(!hasSpecial, `${setCode} should not have Special rarity in foil pool`)
    }
  })

  test('sets 4-6 include Special rarity in foil pool', () => {
    // JTL is set 4, LOF is set 5, SEC is set 6
    for (const setCode of ['JTL', 'LOF', 'SEC']) {
      const belt = new FoilBelt(setCode)
      const hasSpecial = belt.fillingPool.some(c => c.rarity === 'Special')
      assert(hasSpecial, `${setCode} should have Special rarity in foil pool`)
    }
  })

  test('sets 4-6 target Special at ~4% to match packConstants', () => {
    // Sets 4-6 target: Special 4%
    const belt = new FoilBelt('JTL')

    // Sample cards
    const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Special: 0 }
    const sampleSize = 2000
    for (let i = 0; i < sampleSize; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    const total = counts.Common + counts.Uncommon + counts.Rare + counts.Legendary + counts.Special
    const specialPct = (counts.Special / total) * 100

    // Target: Special ~4%, allow ±3% tolerance
    assert(specialPct > 1 && specialPct < 8,
      `Special should be ~4%, got ${specialPct.toFixed(1)}%`)
  })

  test('sets 1-3 have no Special multiplier (Special excluded from pool)', () => {
    const belt = new FoilBelt('SOR')
    // Special should not be in rarityQuantities since it's excluded from pool
    const hasSpecialInPool = belt.fillingPool.some(c => c.rarity === 'Special')
    assert(!hasSpecialInPool, 'Sets 1-3 should not have Special in pool')
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new FoilBelt('SOR')
    const fillSize = Math.min(belt.fillingPool.length, 50) // Use smaller sample for FoilBelt

    // Deploy first batch into an array
    const firstFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      firstFill.push(belt.next().id)
    }

    // Deploy second batch into an array
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
