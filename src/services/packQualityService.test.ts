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
