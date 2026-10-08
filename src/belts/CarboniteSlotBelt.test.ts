// @ts-nocheck
/**
 * CarboniteSlotBelt Tests
 *
 * Run with: node src/belts/CarboniteSlotBelt.test.ts
 */

import { CarboniteSlotBelt, type CarboniteSlotBeltConfig } from './CarboniteSlotBelt'
import { initializeCardCache } from '../utils/cardCache'
import { CARBONITE_CONSTANTS } from '../utils/carboniteConstants'

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
  console.log('\x1b[1m\x1b[35m✨ CarboniteSlotBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  // ========================================
  // Single-rarity: Common Foil
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mCommon Foil Belt\x1b[0m')

  const COMMON_FOIL: CarboniteSlotBeltConfig = {
    rarities: ['Common'],
    sourceVariant: 'Normal',
    outputFlags: { isFoil: true },
  }

  test('Common Foil: initializes with only Common cards', () => {
    const belt = new CarboniteSlotBelt('JTL', COMMON_FOIL)
    assert(belt.fillingPool.length > 0, 'Filling pool should not be empty')
    assert(belt.fillingPool.every(c => c.rarity === 'Common'), 'All cards should be Common')
    assert(belt.fillingPool.every(c => !c.isLeader), 'No leaders in pool')
    assert(belt.fillingPool.every(c => !c.isBase), 'No bases in pool')
  })

  test('Common Foil: next() returns a foil Common', () => {
    const belt = new CarboniteSlotBelt('JTL', COMMON_FOIL)
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.isFoil === true, 'Card should be foil')
    assert(card.rarity === 'Common', `Card should be Common, got ${card.rarity}`)
  })

  test('Common Foil: all 100 draws are foil Commons', () => {
    const belt = new CarboniteSlotBelt('JTL', COMMON_FOIL)
    for (let i = 0; i < 100; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
      assert(card.isFoil === true, `Draw ${i} should be foil`)
      assert(card.rarity === 'Common', `Draw ${i} should be Common, got ${card.rarity}`)
      assert(!card.isHyperspace, `Draw ${i} should NOT be hyperspace`)
    }
  })

  // ========================================
  // Single-rarity: Uncommon Foil
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mUncommon Foil Belt\x1b[0m')

  const UC_FOIL: CarboniteSlotBeltConfig = {
    rarities: ['Uncommon'],
    sourceVariant: 'Normal',
    outputFlags: { isFoil: true },
  }

  test('UC Foil: all draws are foil Uncommons', () => {
    const belt = new CarboniteSlotBelt('JTL', UC_FOIL)
    for (let i = 0; i < 50; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
      assert(card.isFoil === true, `Draw ${i} should be foil`)
      assert(card.rarity === 'Uncommon', `Draw ${i} should be Uncommon, got ${card.rarity}`)
    }
  })

  // ========================================
  // Single-rarity: Common HS
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mCommon Hyperspace Belt\x1b[0m')

  const COMMON_HS: CarboniteSlotBeltConfig = {
    rarities: ['Common'],
    sourceVariant: 'Hyperspace',
    outputFlags: { isHyperspace: true },
  }

  test('Common HS: all draws are Hyperspace Commons', () => {
    const belt = new CarboniteSlotBelt('JTL', COMMON_HS)
    for (let i = 0; i < 50; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
      assert(card.isHyperspace === true, `Draw ${i} should be hyperspace`)
      assert(card.rarity === 'Common', `Draw ${i} should be Common, got ${card.rarity}`)
      assert(!card.isFoil, `Draw ${i} should NOT be foil`)
    }
  })

  // ========================================
  // Single-rarity: Uncommon HS
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mUncommon Hyperspace Belt\x1b[0m')

  const UC_HS: CarboniteSlotBeltConfig = {
    rarities: ['Uncommon'],
    sourceVariant: 'Hyperspace',
    outputFlags: { isHyperspace: true },
  }

  test('UC HS: all draws are Hyperspace Uncommons', () => {
    const belt = new CarboniteSlotBelt('JTL', UC_HS)
    for (let i = 0; i < 50; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
      assert(card.isHyperspace === true, `Draw ${i} should be hyperspace`)
      assert(card.rarity === 'Uncommon', `Draw ${i} should be Uncommon, got ${card.rarity}`)
    }
  })

  // ========================================
  // Weighted multi-rarity: R/L HS
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mR/L Hyperspace Belt (weighted)\x1b[0m')

  const RL_HS: CarboniteSlotBeltConfig = {
    rarities: ['Rare', 'Special', 'Legendary'],
    sourceVariant: 'Hyperspace',
    outputFlags: { isHyperspace: true },
    weights: CARBONITE_CONSTANTS.hsRLWeights,
  }

  test('R/L HS: only produces Rare, Special, or Legendary', () => {
    const belt = new CarboniteSlotBelt('JTL', RL_HS)
    const validRarities = new Set(['Rare', 'Special', 'Legendary'])
    for (let i = 0; i < 100; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
      assert(card.isHyperspace === true, `Draw ${i} should be hyperspace`)
      assert(validRarities.has(card.rarity),
        `Draw ${i} should be R/S/L, got ${card.rarity}`)
    }
  })

  test('R/L HS: weighted distribution — Rare is most common', () => {
    // SPEC: 70% Rare, 20% Special, 10% Legendary
    const belt = new CarboniteSlotBelt('JTL', RL_HS)
    const counts: Record<string, number> = { Rare: 0, Special: 0, Legendary: 0 }
    const sampleSize = 500
    for (let i = 0; i < sampleSize; i++) {
      const card = belt.next()
      counts[card.rarity] = (counts[card.rarity] || 0) + 1
    }

    assert(counts.Rare > counts.Special,
      `Rare (${counts.Rare}) should exceed Special (${counts.Special})`)
    assert(counts.Special > counts.Legendary,
      `Special (${counts.Special}) should exceed Legendary (${counts.Legendary})`)
    assert(counts.Rare > sampleSize * 0.5,
      `Rare should be majority (>50%), got ${(counts.Rare / sampleSize * 100).toFixed(1)}%`)
  })

  // ========================================
  // Fallback behavior
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mFallback Behavior\x1b[0m')

  test('falls back to Normal variant if sourceVariant not found', () => {
    // Use a variant that doesn't exist — should fall back to Normal
    const config: CarboniteSlotBeltConfig = {
      rarities: ['Common'],
      sourceVariant: 'NonExistentVariant',
      outputFlags: { isFoil: true },
    }
    const belt = new CarboniteSlotBelt('JTL', config)
    assert(belt.fillingPool.length > 0, 'Should fall back to Normal variants')
    const card = belt.next()
    assert(card !== null, 'Should return a card from fallback pool')
    assert(card.isFoil === true, 'Output flags should still be applied')
  })

  // ========================================
  // Hopper refill
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mHopper Behavior\x1b[0m')

  test('hopper refills when depleted', () => {
    const belt = new CarboniteSlotBelt('JTL', COMMON_FOIL)
    for (let i = 0; i < 200; i++) {
      const card = belt.next()
      assert(card !== null, `Draw ${i} should not be null`)
    }
    assert(belt.size > 0, 'Hopper should have refilled')
  })

  // ========================================
  // All supported sets
  // ========================================
  console.log('')
  console.log('\x1b[1m\x1b[35mAll Supported Sets\x1b[0m')

  test('works for all Carbonite sets (JTL, LOF, SEC, LAW)', () => {
    for (const setCode of ['JTL', 'LOF', 'SEC', 'LAW']) {
      const belt = new CarboniteSlotBelt(setCode, COMMON_FOIL)
      assert(belt.fillingPool.length > 0, `${setCode} should have cards in pool`)
      const card = belt.next()
      assert(card !== null, `${setCode} should return a card`)
      assert(card.isFoil === true, `${setCode} card should be foil`)
      assert(card.rarity === 'Common', `${setCode} card should be Common`)
    }
  })

  // ========================================
  // Summary
  // ========================================
  console.log('')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')
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
