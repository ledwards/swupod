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

  // SPEC: slots upgrade independently, so the no-upgrade rate is the product of
  // each slot MISSING — not a budget quota. Derived from HS_BELT_CONFIGS
  // slotCounts (packConstants is a spec source per .claude/rules/testing.md).
  function independentZeroRate(group: string): number {
    const { cycleSize, slotCounts } = HS_BELT_CONFIGS[group]
    return Object.values(slotCounts).reduce((p: number, n: number) => p * (1 - n / cycleSize), 1)
  }

  test('no-upgrade rate matches independent slot probabilities', () => {
    const belt = new HyperspaceUpgradeBelt()
    let zeroCount = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (countTrueSlots(belt.next()) === 0) zeroCount++
    }
    const rate = zeroCount / TOTAL_DRAWS
    const expected = independentZeroRate('1-3')
    console.log(`\x1b[36m   No-upgrade rate: ${(rate * 100).toFixed(1)}% (independent expectation ${(expected * 100).toFixed(1)}%)\x1b[0m`)
    assert(
      Math.abs(rate - expected) < 0.03,
      `No-upgrade rate ${(rate * 100).toFixed(1)}% should be ~${(expected * 100).toFixed(1)}%`
    )
  })

  // Slots upgrade INDEPENDENTLY, so 3 in one plan must be possible — independent
  // events overlap. A hard cap would be the modelling error, not the 3-slot pack.
  // It just has to stay rare. Measured ~2.5% of plans at 3, ~0.2% at 4+.
  test('SPEC: 3+ upgrades in one plan are possible but rare', () => {
    const belt = new HyperspaceUpgradeBelt()
    let threePlus = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (countTrueSlots(belt.next()) >= 3) threePlus++
    }
    const rate = threePlus / TOTAL_DRAWS
    console.log(`\x1b[36m   3+ upgrade plans: ${(rate * 100).toFixed(2)}%\x1b[0m`)
    assert(rate <= 0.08, `3+ upgrades in ${(rate * 100).toFixed(2)}% of plans — variance has blown out`)
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
  // CO-OCCURRENCE (leader + base CAN co-occur — real data falsified exclusivity)
  // ========================================================================

  // Previously asserted the opposite for sets 1-6 ("never co-occur, past-set
  // behavior preserved"). Real ASH pool-002 pack06 held a hyperspace leader AND
  // base in one pack, so the exclusivity rule gave a physically real pack
  // probability zero. It is the same press for every set, so the ban is gone on
  // all groups rather than only the one we have transcribed boxes for.
  //
  // The RATE still differs by group and that is expected: the budget cap means
  // leader+base can only share a budget-2 plan, holding co-occurrence to roughly
  // half the independent 1/36. Only ASH's spaced-sheet config reaches ~1/36.
  // Do NOT "correct" a low rate by re-introducing exclusivity.
  test('SPEC: every group permits leader + base in the same pack', () => {
    for (const group of ['1-3', '4-6', 'LAW', 'ASH']) {
      const belt = new HyperspaceUpgradeBelt(group)
      let both = 0, plans = 0
      for (let i = 0; i < 10 * CYCLE_SIZE; i++) {
        const plan = belt.next()
        plans++
        if (plan.leader && plan.base) both++
      }
      assert(both > 0,
        `${group}: leader+base never co-occurred in ${plans} plans — exclusivity has been re-introduced`)
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

  test('LAW: no-upgrade rate matches independent slot probabilities', () => {
    // The guaranteed HS common comes from its own belt, not an upgrade, so a
    // zero-upgrade plan still yields a pack with one hyperspace card.
    const belt = new HyperspaceUpgradeBelt('LAW')
    let zeroCount = 0
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      if (countTrueSlots(belt.next()) === 0) zeroCount++
    }
    const rate = zeroCount / TOTAL_DRAWS
    const expected = independentZeroRate('LAW')
    console.log(`\x1b[36m   LAW no-upgrade rate: ${(rate * 100).toFixed(1)}% (independent expectation ${(expected * 100).toFixed(1)}%)\x1b[0m`)
    assert(
      Math.abs(rate - expected) < 0.03,
      `LAW no-upgrade rate ${(rate * 100).toFixed(1)}% should be ~${(expected * 100).toFixed(1)}%`
    )
  })

  test('LAW: total upgrades per cycle approximately equals 40', () => {
    // common: 0 (dedicated belt), uc1/uc2: 0 (UC3 is the only UC upgrade slot),
    // so total = leader:10 + base:10 + uc3:20 = 40
    const belt = new HyperspaceUpgradeBelt('LAW')
    let totalUpgrades = 0
    for (let i = 0; i < CYCLE_SIZE; i++) {
      totalUpgrades += countTrueSlots(belt.next())
    }
    console.log(`\x1b[36m   LAW upgrades per cycle: ${totalUpgrades} (expected 40)\x1b[0m`)
    assert(Math.abs(totalUpgrades - 40) <= 1, `Total upgrades per cycle = ${totalUpgrades}, expected 40 ±1`)
  })

  test('FIXED: LAW/ASH UC1 and UC2 never upgrade to HS (SPEC: UC3 is the only UC upgrade slot for Set 7+; real ASH box observed 0/48)', () => {
    const belt = new HyperspaceUpgradeBelt('LAW')
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const plan = belt.next()
      assert(!plan.uc1, `Plan ${i} has uc1 upgrade — UC1 must never upgrade for Set 7+`)
      assert(!plan.uc2, `Plan ${i} has uc2 upgrade — UC2 must never upgrade for Set 7+`)
    }
  })

  test('FIXED: LAW leader + base can co-occur (real ASH pool-002 pack06 had HS leader + HS base; only budget-2 plans, so 0-4 per 60-pack cycle)', () => {
    // SPEC (L5): LAW group has budget-2 = 6/cycle, so leader+base co-occurrence is
    // bounded above by 6/cycle and empirically lands roughly 0-4 per cycle. Over 50
    // cycles it must be > 0 (co-occurrence is now possible) and well under the cap.
    const CO_CYCLES = 50
    const belt = new HyperspaceUpgradeBelt('LAW')
    let coCount = 0
    for (let i = 0; i < CO_CYCLES * CYCLE_SIZE; i++) {
      const plan = belt.next()
      if (plan.leader && plan.base) coCount++
    }
    console.log(`\x1b[36m   LAW leader+base co-occurrences over ${CO_CYCLES} cycles: ${coCount} (${(coCount / CO_CYCLES).toFixed(2)}/cycle)\x1b[0m`)
    assert(coCount > 0, `LAW leader+base must be able to co-occur, got ${coCount} over ${CO_CYCLES} cycles`)
    assert(coCount <= 300, `LAW leader+base co-occurrence ${coCount} unexpectedly high over ${CO_CYCLES} cycles (cap 300)`)
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

  test('FIXED: ASH spaces HS leader/base on the sheet — right rate AND tight per-box spread', () => {
    // SPEC (11 verified real boxes, 261 packs, number-first re-read 2026-07-12):
    // HS leader 46/261 = 17.6% and HS base 41/261 = 15.7%, both AT 1/6 = 4/box
    // (per-box mode exactly 4/4), and SPACED (real per-box sd ~0.7, well under
    // a shuffled sheet's ~1.3). ASH config: leader 10/60, base 10/60, spaced.
    const belt = new HyperspaceUpgradeBelt('ASH')
    const BOXES = 1500
    const lead: number[] = []
    const base: number[] = []
    for (let b = 0; b < BOXES; b++) {
      let l = 0
      let ba = 0
      for (let p = 0; p < 24; p++) {
        const plan = belt.next()
        if (plan.leader) l++
        if (plan.base) ba++
      }
      lead.push(l)
      base.push(ba)
    }
    const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length
    const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length) }
    const lm = mean(lead)
    const bm = mean(base)
    // Means on target (10/60*24 = 4.0 each).
    assert(lm > 3.7 && lm < 4.3, `SPEC: HS leader ~4.0/box (1/6), got ${lm.toFixed(2)}`)
    assert(bm > 3.7 && bm < 4.3, `SPEC: HS base ~4.0/box (1/6), got ${bm.toFixed(2)}`)
    // Spread far tighter than a shuffled sheet (leader hypergeometric sd ≈ 1.3).
    assert(sd(lead) < 0.9, `SPEC: HS leader must be spaced, not shuffled — sd ${sd(lead).toFixed(2)} (shuffled ≈ 1.3)`)
    assert(sd(base) < 0.9, `SPEC: HS base must be spaced, not shuffled — sd ${sd(base).toFixed(2)} (shuffled ≈ 1.15)`)
  })

  test('LAW unchanged: leader + base still 1/6 via the shuffled budget path', () => {
    // Guard: the ASH spaced path must not touch LAW.
    const belt = new HyperspaceUpgradeBelt('LAW')
    let l = 0
    let b = 0
    const N = 6000
    for (let i = 0; i < N; i++) {
      const plan = belt.next()
      if (plan.leader) l++
      if (plan.base) b++
    }
    assert(Math.abs(l / N - 1 / 6) / (1 / 6) < 0.06, `LAW leader HS should stay ~1/6, got ${(l / N).toFixed(3)}`)
    assert(Math.abs(b / N - 1 / 6) / (1 / 6) < 0.06, `LAW base HS should stay ~1/6, got ${(b / N).toFixed(3)}`)
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
