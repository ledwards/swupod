// @ts-nocheck
/**
 * HyperfoilBelt Tests
 *
 * Run with: node src/belts/HyperfoilBelt.test.ts
 */

import { HyperfoilBelt } from './HyperfoilBelt'
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
  console.log('\x1b[1m\x1b[35m💫 HyperfoilBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with Hyperspace Foil variant cards', () => {
    const belt = new HyperfoilBelt('SOR')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.variantType === 'Hyperspace Foil'), 'All cards should be Hyperspace Foil variant')
    assert(belt.fillingPool.every(c => !c.isLeader && !c.isBase), 'No leaders or bases')
  })

  test('next() returns a hyperfoil card', () => {
    const belt = new HyperfoilBelt('SOR')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isFoil === true, 'Returned card should be marked as foil')
    assert(card.isHyperspace === true, 'Returned card should be marked as hyperspace')
    assert(card.variantType === 'Hyperspace Foil', 'Returned card should be Hyperspace Foil variant')
  })

  test('next() removes card from hopper', () => {
    const belt = new HyperfoilBelt('SOR')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('commons appear most frequently', () => {
    const belt = new HyperfoilBelt('SOR')
    const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 }
    // 500 draws (not 200): the tightest ordinal here (Uncommon > Rare) had only a ~4.4σ
    // margin at n=200; at n=500 it is ~6.9σ. Per .claude/rules/testing.md (seeded-RNG
    // ordinals need a comfortable margin so pure variance never flips the ranking).
    for (let i = 0; i < 500; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }
    assert(counts.Common > counts.Uncommon, 'Commons should appear more than uncommons')
    assert(counts.Uncommon > counts.Rare, 'Uncommons should appear more than rares')
  })

  test('sets 1-3 exclude Special rarity', () => {
    const belt = new HyperfoilBelt('SOR')
    const hasSpecial = belt.fillingPool.some(c => c.rarity === 'Special')
    assert(!hasSpecial, 'SOR should not have Special rarity in hyperfoil')
  })

  test('sets 4-6 target Special at ~4% from packConstants', () => {
    const belt = new HyperfoilBelt('JTL')

    // Sample cards
    const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Special: 0 }
    const sampleSize = 1000
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

  test('hopper refills when depleted', () => {
    const belt = new HyperfoilBelt('SOR')
    const bootSize = belt._calculateBootSize()

    while (belt.size > bootSize) {
      belt.next()
    }

    // Pull one more (hopper is still at threshold, won't refill yet)
    belt.next()
    // Pull another (hopper is now below threshold, should trigger refill)
    belt.next()
    assert(belt.size >= bootSize, 'Hopper should refill')
  })

  // === LAW-specific tests ===
  console.log('')
  console.log('\x1b[1m\x1b[35m🤠 LAW HyperfoilBelt Tests\x1b[0m')

  test('LAW: initializes with Hyperspace Foil or Hyperspace variant cards', () => {
    const belt = new HyperfoilBelt('LAW')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    // LAW may have HSF data or fall back to Hyperspace variants
    assert(belt.fillingPool.every(c =>
      c.variantType === 'Hyperspace Foil' || c.variantType === 'Hyperspace'
    ), 'Pool should use Hyperspace Foil or Hyperspace variant cards')
  })

  test('LAW: next() returns card marked as isFoil and isHyperspace', () => {
    const belt = new HyperfoilBelt('LAW')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isFoil === true, 'Card should be marked as foil')
    assert(card.isHyperspace === true, 'Card should be marked as hyperspace')
  })

  test('LAW: includes Special rarity in pool', () => {
    const belt = new HyperfoilBelt('LAW')
    const hasSpecial = belt.fillingPool.some(c => c.rarity === 'Special')
    assert(hasSpecial, 'LAW should include Special rarity in hyperfoil pool')
    // Verify Special has a multiplier assigned
    assert(belt.rarityQuantities.Special !== undefined && belt.rarityQuantities.Special > 0,
      'LAW should have a Special multiplier assigned')
  })

  test('LAW: no leaders or bases in pool', () => {
    const belt = new HyperfoilBelt('LAW')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in filling pool')
    assert(belt.fillingPool.every(c => !c.isBase), 'No bases in filling pool')
  })

  test('LAW: rarity distribution follows expected weights', () => {
    const belt = new HyperfoilBelt('LAW')
    const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Special: 0, Legendary: 0 }
    // 1500 draws (not 300): the tightest ordinal (Rare > Legendary) had only a ~3.0σ margin
    // at n=300 (Rare ~26.7 vs Legendary ~11.3 per 300, diff sd ~5.1 → flipped ~0.16% of
    // runs). At n=1500 the margin is ~6.7σ. Per .claude/rules/testing.md (seeded-RNG
    // ordinals need a comfortable margin so pure variance never flips the ranking).
    for (let i = 0; i < 1500; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }
    assert(counts.Common > counts.Uncommon, `Commons (${counts.Common}) should exceed uncommons (${counts.Uncommon})`)
    assert(counts.Uncommon > counts.Rare, `Uncommons (${counts.Uncommon}) should exceed rares (${counts.Rare})`)
    assert(counts.Rare > counts.Legendary, `Rares (${counts.Rare}) should exceed legendaries (${counts.Legendary})`)
  })

  test('ASH: fallback art still returns Hyperspace Foil flags', () => {
    const belt = new HyperfoilBelt('ASH')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(
      belt.fillingPool.every(c => c.variantType === 'Hyperspace Foil' || c.variantType === 'Hyperspace' || c.variantType === 'Normal'),
      'Fallback pool should use the best available HSF, Hyperspace, or Normal card art source'
    )
    if (belt.usingNormalFallback) {
      assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'Normal fallback pool should use Normal cards as art source')
    }

    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(
      card.variantType === 'Hyperspace Foil' || card.variantType === 'Hyperspace' || card.variantType === 'Normal',
      'Fallback card keeps the selected art source'
    )
    assert(card.isFoil === true, 'Fallback HSF should be marked foil')
    assert(card.isHyperspace === true, 'Fallback HSF should be marked hyperspace')
  })

  test('no repeating pattern: consecutive belt fills produce different sequences', () => {
    const belt = new HyperfoilBelt('SOR')
    const fillSize = Math.min(belt.fillingPool.length, 30)

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
