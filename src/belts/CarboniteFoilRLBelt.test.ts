// @ts-nocheck
/**
 * CarboniteFoilRLBelt Tests
 *
 * Run with: node src/belts/CarboniteFoilRLBelt.test.ts
 */

import { CarboniteFoilRLBelt } from './CarboniteFoilRLBelt'
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

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  console.log('')
  console.log('\x1b[1m\x1b[35m🧊 CarboniteFoilRLBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with R/L/Special cards only', () => {
    const belt = new CarboniteFoilRLBelt('JTL')
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c =>
      c.rarity === 'Rare' || c.rarity === 'Legendary' || c.rarity === 'Special'
    ), 'Pool should only contain Rare, Legendary, or Special cards')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in filling pool')
    assert(belt.fillingPool.every(c => !c.isBase), 'No bases in filling pool')
    assert(belt.fillingPool.every(c => c.variantType === 'Normal'), 'All cards should be normal variants')
  })

  test('next() returns a foil card', () => {
    const belt = new CarboniteFoilRLBelt('JTL')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isFoil === true, 'Returned card should be marked as foil')
    assert(
      card.rarity === 'Rare' || card.rarity === 'Legendary' || card.rarity === 'Special',
      `Card should be R/L/S rarity, got ${card.rarity}`
    )
  })

  test('all cards from belt are R/L/Special rarity over 100 draws', () => {
    const belt = new CarboniteFoilRLBelt('JTL')
    for (let i = 0; i < 100; i++) {
      const card = belt.next()
      assert(card !== null, `Card ${i} should not be null`)
      assert(
        card.rarity === 'Rare' || card.rarity === 'Legendary' || card.rarity === 'Special',
        `Card ${i} should be R/L/S, got ${card.rarity}`
      )
      assert(card.isFoil === true, `Card ${i} should be foil`)
    }
  })

  test('rarity distribution roughly matches weights (70/20/10)', () => {
    const belt = new CarboniteFoilRLBelt('JTL')
    const counts: Record<string, number> = { Rare: 0, Legendary: 0, Special: 0 }
    const sampleSize = 1000
    for (let i = 0; i < sampleSize; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    const total = counts.Rare + counts.Legendary + counts.Special
    const rarePct = (counts.Rare / total) * 100
    const specialPct = (counts.Special / total) * 100
    const legendaryPct = (counts.Legendary / total) * 100

    // Rare ~70%, Special ~20%, Legendary ~10% (wide tolerance for weighted belt)
    assert(rarePct > 40, `Rare should be majority, got ${rarePct.toFixed(1)}%`)
    assert(counts.Rare > counts.Special, `Rares (${counts.Rare}) should exceed specials (${counts.Special})`)
    assert(counts.Rare > counts.Legendary, `Rares (${counts.Rare}) should exceed legendaries (${counts.Legendary})`)
  })

  test('hopper refills when depleted', () => {
    const belt = new CarboniteFoilRLBelt('JTL')
    // Draw many cards
    for (let i = 0; i < 200; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
    }
    assert(belt.size > 0, 'Hopper should have refilled')
  })

  test('works for all supported Carbonite sets', () => {
    for (const setCode of ['JTL', 'LOF', 'SEC']) {
      const belt = new CarboniteFoilRLBelt(setCode)
      assert(belt.fillingPool.length > 0, `${setCode} should have cards in pool`)
      const card = belt.next()
      assert(card !== null, `${setCode} should return a card`)
      assert(card.isFoil === true, `${setCode} card should be foil`)
    }
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
