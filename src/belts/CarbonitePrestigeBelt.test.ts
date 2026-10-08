// @ts-nocheck
/**
 * CarbonitePrestigeBelt Tests
 *
 * Run with: node src/belts/CarbonitePrestigeBelt.test.ts
 */

import { CarbonitePrestigeBelt } from './CarbonitePrestigeBelt'
import { initializeCardCache } from '../utils/cardCache'

let passed = 0
let failed = 0

const PRESTIGE_VARIANTS = ['Standard Prestige', 'Foil Prestige', 'Serialized Prestige']

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
  console.log('\x1b[1m\x1b[35m🏆 CarbonitePrestigeBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(40) + '\x1b[0m')

  test('initializes with real prestige cards from cards.json', () => {
    const belt = new CarbonitePrestigeBelt('JTL')
    assert(!belt.useSynthesis, 'Should use real prestige cards, not synthesis')
    assert(belt.size > 0, 'Belt should have cards')
    // Verify all three tiers have cards
    for (const tierKey of ['tier1', 'tier2', 'serialized']) {
      const tier = belt.tiers[tierKey]
      assert(tier !== undefined, `Tier ${tierKey} should exist`)
      assert(tier.fillingPool.length > 0, `Tier ${tierKey} filling pool should not be empty`)
    }
  })

  test('next() returns a real Prestige variant card', () => {
    const belt = new CarbonitePrestigeBelt('JTL')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(PRESTIGE_VARIANTS.includes(card.variantType),
      `variantType should be a prestige type, got ${card.variantType}`)
    assert(card.isPrestige === true, 'Card should have isPrestige flag')
    assert(
      card.prestigeTier === 'tier1' || card.prestigeTier === 'tier2' || card.prestigeTier === 'serialized',
      `prestigeTier should be valid, got ${card.prestigeTier}`
    )
  })

  test('all cards have prestige variantType', () => {
    const belt = new CarbonitePrestigeBelt('JTL')
    for (let i = 0; i < 50; i++) {
      const card = belt.next()
      assert(card !== null, `Card ${i} should not be null`)
      assert(PRESTIGE_VARIANTS.includes(card.variantType),
        `Card ${i} should be Prestige variant, got ${card.variantType}`)
      assert(card.isPrestige === true, `Card ${i} should have isPrestige flag`)
    }
  })

  test('prestige tier distribution matches weights over many draws', () => {
    // SPEC: tier1 80%, tier2 18%, serialized 2%
    const belt = new CarbonitePrestigeBelt('JTL')
    const counts = { tier1: 0, tier2: 0, serialized: 0 }
    const sampleSize = 2000
    for (let i = 0; i < sampleSize; i++) {
      const card = belt.next()
      counts[card.prestigeTier] = (counts[card.prestigeTier] || 0) + 1
    }

    const total = counts.tier1 + counts.tier2 + counts.serialized
    const tier1Pct = (counts.tier1 / total) * 100
    const tier2Pct = (counts.tier2 / total) * 100
    const serializedPct = (counts.serialized / total) * 100

    // tier1 ~80%, allow ±10%
    assert(tier1Pct > 65 && tier1Pct < 92,
      `Tier1 should be ~80%, got ${tier1Pct.toFixed(1)}%`)
    // tier2 ~18%, allow ±8%
    assert(tier2Pct > 8 && tier2Pct < 28,
      `Tier2 should be ~18%, got ${tier2Pct.toFixed(1)}%`)
    // serialized ~2%, allow generous tolerance for small count
    assert(serializedPct < 8,
      `Serialized should be ~2%, got ${serializedPct.toFixed(1)}%`)
    assert(counts.serialized > 0,
      `Should have at least 1 serialized in ${sampleSize} draws`)
  })

  test('works for all supported Carbonite sets', () => {
    for (const setCode of ['JTL', 'LOF', 'SEC', 'LAW']) {
      const belt = new CarbonitePrestigeBelt(setCode)
      assert(!belt.useSynthesis, `${setCode} should use real prestige cards`)
      assert(belt.size > 0, `${setCode} should have cards in belt`)
      const card = belt.next()
      assert(card !== null, `${setCode} should return a card`)
      assert(PRESTIGE_VARIANTS.includes(card.variantType),
        `${setCode} card should be Prestige variant, got ${card.variantType}`)
    }
  })

  test('nextTier1() always returns Standard Prestige', () => {
    const belt = new CarbonitePrestigeBelt('JTL')
    for (let i = 0; i < 50; i++) {
      const card = belt.nextTier1()
      assert(card !== null, `nextTier1 draw ${i} should not be null`)
      assert(card.variantType === 'Standard Prestige',
        `nextTier1 should return Standard Prestige, got ${card.variantType}`)
      assert(card.prestigeTier === 'tier1',
        `nextTier1 should return tier1, got ${card.prestigeTier}`)
    }
  })

  test('nextTier1() can refuse synthesis for standard packs without real prestige data', () => {
    const belt = new CarbonitePrestigeBelt('ASH')
    const card = belt.nextTier1({ allowSynthesis: false })

    if (belt.useSynthesis) {
      assert(card === null, 'ASH standard packs should no-op prestige until real prestige variants exist')
    } else {
      assert(card !== null, 'ASH should draw real Standard Prestige once variants exist')
      assert(card.variantType === 'Standard Prestige',
        `Expected real Standard Prestige, got ${card.variantType}`)
    }
  })

  test('prestige cards include uncommons (not just R/L)', () => {
    // Real prestige data includes Uncommons — synthesis only had R/L
    const belt = new CarbonitePrestigeBelt('JTL')
    const rarities = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const card = belt.next()
      if (card) rarities.add(card.rarity)
    }
    assert(rarities.has('Uncommon'), 'Prestige cards should include Uncommons')
  })

  test('hopper refills when depleted', () => {
    const belt = new CarbonitePrestigeBelt('JTL')
    for (let i = 0; i < 200; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
    }
    assert(belt.size > 0, 'Hopper should have refilled')
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
