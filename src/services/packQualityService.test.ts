// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildMetricResult, calculateChiSquared } from './packQualityService'

describe('buildMetricResult', () => {
  it('returns expected status for small z-score', () => {
    // 100 observed out of 1000 samples with 10% expected rate = exactly on target
    const result = buildMetricResult(100, 1000, 0.1)
    assert.strictEqual(result.status, 'expected')
    assert.strictEqual(result.observed, 100)
    assert.strictEqual(result.expected, 100)
    assert.ok(Math.abs(result.zScore) < 0.01, `z-score should be ~0, got ${result.zScore}`)
  })

  it('returns outlier status for large z-score', () => {
    // 200 observed out of 1000 samples with 10% expected rate = way off
    const result = buildMetricResult(200, 1000, 0.1)
    assert.strictEqual(result.status, 'outlier')
    assert.ok(Math.abs(result.zScore) > 2, `z-score should be > 2, got ${result.zScore}`)
  })
})

describe('calculateChiSquared', () => {
  it('returns expected for matching distribution', () => {
    const observed = { Common: 54, Uncommon: 18, Rare: 6, Legendary: 1 }
    const expected = { Common: 54, Uncommon: 18, Rare: 6, Legendary: 1 }
    const result = calculateChiSquared(observed, expected)
    assert.strictEqual(result.status, 'expected')
    assert.strictEqual(result.chiSquared, 0)
  })

  it('returns outlier for skewed distribution', () => {
    // All cards are Common when we expected a spread
    const observed = { Common: 100, Uncommon: 0, Rare: 0, Legendary: 0 }
    const expected = { Common: 54, Uncommon: 18, Rare: 6, Legendary: 1 }
    const result = calculateChiSquared(observed, expected)
    assert.strictEqual(result.status, 'outlier')
    assert.ok(result.chiSquared > 10, `chi-squared should be large, got ${result.chiSquared}`)
  })
})

// ---------------------------------------------------------------------------
// Set mapping + expected ">=1 HS per pack" rate.
//
// BUGGY (pre-fix): getSetNumber had no ASH entry and fell back to 4, so the
// dashboard graded ASH against the Sets 4-6 constants and HS belt. And the
// expected >=1-HS rate was a budget QUOTA, (cycle - budget[0]) / cycle — 60%
// for '1-3' — when slots upgrade independently: P(>=1) = 1 - Π(1 - count/cycle)
// over HS_BELT_CONFIGS slotCounts (.claude/rules/belt-system.md, "There Is No
// Hard Upgrade Cap"). Set 7+ packs carry a dedicated HS common in every pack
// (packRules.hyperspaceCommonSlot), so their expected rate is 1.
// ---------------------------------------------------------------------------
import { getSetNumber, getHsBeltKey, expectedAtLeastOneHsPackRate } from './packQualityService'
import { SET_CONFIGS } from '../utils/setConfigs/index'
import { HS_BELT_CONFIGS } from '../utils/packConstants'

describe('FIXED: set mapping uses the set-config registry', () => {
  it('maps every configured set to its configured setNumber (ASH = 8, not the Sets 4-6 fallback)', () => {
    for (const [code, cfg] of Object.entries(SET_CONFIGS)) {
      assert.strictEqual(getSetNumber(code), cfg.setNumber, `${code} setNumber`)
    }
    assert.strictEqual(getSetNumber('ASH'), 8)
  })

  it('maps ASH to its own HS belt group and LAW to LAW', () => {
    assert.strictEqual(getHsBeltKey('ASH'), 'ASH')
    assert.strictEqual(getHsBeltKey('LAW'), 'LAW')
    assert.strictEqual(getHsBeltKey('SOR'), '1-3')
    assert.strictEqual(getHsBeltKey('JTL'), '4-6')
  })
})

describe('FIXED: expected >=1-HS pack rate is derived, not a budget quota', () => {
  const derived = (group: string) => {
    const cfg = HS_BELT_CONFIGS[group]
    return 1 - Object.values(cfg.slotCounts).reduce((p, n) => p * (1 - n / cfg.cycleSize), 1)
  }
  it('Sets 1-6 use 1 - Π(1 - slotCount/cycle)', () => {
    for (const [code, group] of [['SOR', '1-3'], ['SHD', '1-3'], ['TWI', '1-3'], ['JTL', '4-6'], ['LOF', '4-6'], ['SEC', '4-6']]) {
      const got = expectedAtLeastOneHsPackRate(code)
      assert.ok(Math.abs(got - derived(group)) < 1e-12, `${code}: ${got} vs derived ${derived(group)}`)
      const quota = (HS_BELT_CONFIGS[group].cycleSize - HS_BELT_CONFIGS[group].budgetDistribution[0]) / HS_BELT_CONFIGS[group].cycleSize
      assert.notStrictEqual(got, quota, `${code}: must not be the budget quota ${quota}`)
    }
  })
  it('Set 7+ (LAW, ASH) carry a guaranteed HS common, so every pack has >=1 HS', () => {
    assert.strictEqual(expectedAtLeastOneHsPackRate('LAW'), 1)
    assert.strictEqual(expectedAtLeastOneHsPackRate('ASH'), 1)
  })
})
