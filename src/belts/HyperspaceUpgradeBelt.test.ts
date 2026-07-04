// @ts-nocheck
/**
 * HyperspaceUpgradeBelt Tests
 *
 * Tests the budget belt that pre-determines HS upgrade distribution per pack.
 * No card data needed — this belt dispenses UpgradePlans, not cards.
 *
 * Run with: npx tsx src/belts/HyperspaceUpgradeBelt.test.ts
 */

import { HyperspaceUpgradeBelt } from './HyperspaceUpgradeBelt'
import { HS_BELT_CONFIGS } from '../utils/packConstants'

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

interface UpgradePlan {
  leader: boolean
  base: boolean
  common: boolean
  uc1: boolean
  uc2: boolean
  uc3: boolean
  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
}

function countTrueSlots(plan: UpgradePlan): number {
  return [plan.leader, plan.base, plan.common, plan.uc1, plan.uc2, plan.uc3]
    .filter(Boolean).length
}

function runTests(): void {
  console.log('\x1b[1m\x1b[35m🌀 HyperspaceUpgradeBelt Tests\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  const CYCLES = 10
  const CYCLE_SIZE = 60
  const TOTAL_DRAWS = CYCLES * CYCLE_SIZE

  // ========================================================================
  // BASIC CONSTRUCTION
  // ========================================================================

  test('constructs without error', () => {
    const belt = new HyperspaceUpgradeBelt()
    assert(belt !== null, 'Belt should exist')
  })

  test('next() returns an UpgradePlan', () => {
    const belt = new HyperspaceUpgradeBelt()
    const plan = belt.next()
    assert(plan !== null && plan !== undefined, 'Plan should not be null')
    assert(typeof plan.leader === 'boolean', 'leader should be boolean')
    assert(typeof plan.base === 'boolean', 'base should be boolean')
    assert(typeof plan.common === 'boolean', 'common should be boolean')
    assert(typeof plan.uc1 === 'boolean', 'uc1 should be boolean')
    assert(typeof plan.uc2 === 'boolean', 'uc2 should be boolean')
    assert(typeof plan.uc3 === 'boolean', 'uc3 should be boolean')
    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  })

  // ========================================================================
  // BUDGET DISTRIBUTION
  // ========================================================================

  test('40% of plans have budget 0 (no HS)', () => {
    // After removing rare slot upgrade, budget distribution is 24/60 budget-0
    const belt = new HyperspaceUpgradeBelt()
    let zeroCount = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const plan = belt.next()
      if (countTrueSlots(plan) === 0) zeroCount++
    }
    const rate = zeroCount / TOTAL_DRAWS
    console.log(`\x1b[36m   Budget-0 rate: ${(rate * 100).toFixed(1)}% (${zeroCount}/${TOTAL_DRAWS})\x1b[0m`)
    // Budget-0 is 24/60 = 40%
    assert(
      Math.abs(rate - 24 / 60) < 0.02,
      `Budget-0 rate ${(rate * 100).toFixed(1)}% should be ~40.0%`
    )
  })

  test('max budget is 2 (no plan has >2 HS slots)', () => {
    const belt = new HyperspaceUpgradeBelt()
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const plan = belt.next()
      const count = countTrueSlots(plan)
      assert(
        count <= 2,
        `Plan ${i} has ${count} HS slots, max should be 2`
      )
    }
  })

  test('total upgrades per cycle approximately equals config', () => {
    const config = HS_BELT_CONFIGS['1-3']
    const expectedPerCycle = config.budgetDistribution[1] + 2 * config.budgetDistribution[2]
    const belt = new HyperspaceUpgradeBelt()
    let totalUpgrades = 0
    for (let i = 0; i < CYCLE_SIZE; i++) {
      totalUpgrades += countTrueSlots(belt.next())
    }
    console.log(`\x1b[36m   Upgrades per cycle: ${totalUpgrades} (expected ${expectedPerCycle})\x1b[0m`)
    // Allow ±1 due to leader/base co-occurrence constraint occasionally blocking placement
    assert(
      Math.abs(totalUpgrades - expectedPerCycle) <= 1,
      `Total upgrades per cycle = ${totalUpgrades}, expected ${expectedPerCycle} ±1`
    )
  })

  // ========================================================================
  // CO-OCCURRENCE CONSTRAINTS
  // ========================================================================

  test('leader + base never co-occur in same plan', () => {
    const belt = new HyperspaceUpgradeBelt()
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const plan = belt.next()
      assert(
        !(plan.leader && plan.base),
        `Plan ${i} has both leader and base HS — should never co-occur`
      )
    }
  })

  // ========================================================================
  // PER-SLOT RATES
  // ========================================================================

  test('leader HS rate is approximately 1/6', () => {
    const belt = new HyperspaceUpgradeBelt()
    let count = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (belt.next().leader) count++
    }
    const rate = count / TOTAL_DRAWS
    const expected = 1 / 6
    console.log(`\x1b[36m   Leader HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)\x1b[0m`)
    assert(
      Math.abs(rate - expected) / expected < 0.05,
      `Leader HS rate ${(rate * 100).toFixed(1)}% deviates >5% from expected ${(expected * 100).toFixed(1)}%`
    )
  })

  test('base HS rate is approximately 1/6', () => {
    const belt = new HyperspaceUpgradeBelt()
    let count = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (belt.next().base) count++
    }
    const rate = count / TOTAL_DRAWS
    const expected = 1 / 6
    console.log(`\x1b[36m   Base HS rate: ${(rate * 100).toFixed(1)}% (expected ${(expected * 100).toFixed(1)}%)\x1b[0m`)
    assert(
      Math.abs(rate - expected) / expected < 0.05,
      `Base HS rate ${(rate * 100).toFixed(1)}% deviates >5% from expected ${(expected * 100).toFixed(1)}%`
    )
  })

  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  // (rare HS rate test removed)

  // ========================================================================
  // HOPPER REFILL
  // ========================================================================

  test('can draw 120 plans (2 full cycles) without error', () => {
    const belt = new HyperspaceUpgradeBelt()
    for (let i = 0; i < 120; i++) {
      const plan = belt.next()
      assert(plan !== null && plan !== undefined, `Plan ${i} should not be null`)
    }
  })

  test('plans are shuffled (two cycles are not identical)', () => {
    const belt = new HyperspaceUpgradeBelt()
    const cycle1: UpgradePlan[] = []
    const cycle2: UpgradePlan[] = []
    for (let i = 0; i < CYCLE_SIZE; i++) cycle1.push(belt.next())
    for (let i = 0; i < CYCLE_SIZE; i++) cycle2.push(belt.next())

    // Convert to comparable strings
    const str1 = cycle1.map(p => countTrueSlots(p)).join(',')
    const str2 = cycle2.map(p => countTrueSlots(p)).join(',')
    assert(
      str1 !== str2,
      'Two consecutive cycles should not have identical budget sequences (shuffling failed)'
    )
  })

  // ========================================================================
  // LAW CONFIG (guaranteed ≥1 HS per pack)
  // ========================================================================

  console.log('')
  console.log('\x1b[1m\x1b[35m🤠 LAW HyperspaceUpgradeBelt Tests\x1b[0m')

  test('LAW: ~37% of plans have budget 0 (HS common is from dedicated belt, not upgrade)', () => {
    // LAW config: budget-0 = 22/60 = 36.7%
    const belt = new HyperspaceUpgradeBelt('LAW')
    let zeroCount = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const plan = belt.next()
      if (countTrueSlots(plan) === 0) zeroCount++
    }
    const rate = zeroCount / TOTAL_DRAWS
    console.log(`\x1b[36m   LAW budget-0 rate: ${(rate * 100).toFixed(1)}% (expected 36.7%)\x1b[0m`)
    assert(
      Math.abs(rate - 22 / 60) < 0.02,
      `Budget-0 rate ${(rate * 100).toFixed(1)}% should be ~36.7%`
    )
  })

  test('LAW: total upgrades per cycle approximately equals 46', () => {
    // common: 0 (dedicated belt), so total = leader:10 + base:10 + uc1:4 + uc2:2 + uc3:20 = 46
    const belt = new HyperspaceUpgradeBelt('LAW')
    let totalUpgrades = 0
    for (let i = 0; i < CYCLE_SIZE; i++) {
      totalUpgrades += countTrueSlots(belt.next())
    }
    console.log(`\x1b[36m   LAW upgrades per cycle: ${totalUpgrades} (expected 46)\x1b[0m`)
    assert(Math.abs(totalUpgrades - 46) <= 1, `Total upgrades per cycle = ${totalUpgrades}, expected 46 ±1`)
  })

  test('LAW: leader + base never co-occur', () => {
    const belt = new HyperspaceUpgradeBelt('LAW')
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const plan = belt.next()
      assert(!(plan.leader && plan.base), `Plan ${i} has both leader and base`)
    }
  })

  test('LAW: leader HS rate is approximately 1/6', () => {
    const belt = new HyperspaceUpgradeBelt('LAW')
    let count = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (belt.next().leader) count++
    }
    const rate = count / TOTAL_DRAWS
    console.log(`\x1b[36m   LAW leader HS rate: ${(rate * 100).toFixed(1)}% (expected 16.7%)\x1b[0m`)
    assert(Math.abs(rate - 1 / 6) / (1 / 6) < 0.05, `Leader HS rate ${(rate * 100).toFixed(1)}% off target`)
  })

  test('LAW: common HS rate is 0 (dedicated belt, not upgrade)', () => {
    // LAW config: common: 0 — HS common comes from dedicated HyperspaceCommonBelt
    const belt = new HyperspaceUpgradeBelt('LAW')
    let count = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (belt.next().common) count++
    }
    assert(count === 0, `Common HS count should be 0 (dedicated belt), got ${count}`)
  })

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('')
  console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m')
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
    console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED\x1b[0m')
  }
}

runTests()
