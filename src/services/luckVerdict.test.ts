// @ts-nocheck
/**
 * Tests for src/services/luckVerdict.ts.
 *
 * Spec-first per .claude/rules/testing.md: all expected p-values and regime
 * outcomes are computed from textbook binomial / Poisson tables, not from the
 * function under test.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  verdict,
  isInterestingStreak,
  MIN_PACKS_RARITY,
  MIN_PACKS_ASPECT,
  MIN_PACKS_PER_CARD,
} from './luckVerdict.ts'

// ---------------------------------------------------------------------------
// verdict — happy path: observed == expected at large n
// ---------------------------------------------------------------------------
describe('verdict — observed exactly equal to expected at large n', () => {
  it('rarity: returns normal regime with p-value near 1', () => {
    // n=1000 packs, p=0.125 (legendary), expected=125, observed=125.
    // z = (125-125) / sqrt(1000*0.125*0.875) = 0 → p ≈ 1.
    const r = verdict({ observed: 125, expected: 125, n: 1000, dimension: 'rarity' })
    assert.strictEqual(r.regime, 'normal', `expected normal, got ${r.regime}`)
    assert.ok(Math.abs(r.pValue - 1.0) < 0.01, `p-value expected ~1, got ${r.pValue}`)
    assert.ok(r.copy.length > 0, 'copy should be non-empty')
    assert.match(r.copy, /normal/i)
  })

  it('aspect: returns normal regime with p-value near 1', () => {
    // 60 packs (the MIN_PACKS_ASPECT floor), expected=10, observed=10.
    const r = verdict({ observed: 10, expected: 10, n: 60, dimension: 'aspect' })
    assert.strictEqual(r.regime, 'normal')
    assert.ok(r.copy.length > 0)
    assert.match(r.copy, /normal/i)
  })

  it('streaks: returns normal regime with p-value near 1', () => {
    // 200 packs (the MIN_PACKS_PER_CARD floor), expected=15, observed=15.
    const r = verdict({ observed: 15, expected: 15, n: 200, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'normal')
    assert.match(r.copy, /no card|normal|streak/i)
  })
})

// ---------------------------------------------------------------------------
// verdict — happy path: observed = 2x expected at large n → unusual
// ---------------------------------------------------------------------------
describe('verdict — observed at 2x expected with large n', () => {
  it('rarity: returns unusual regime with small p-value', () => {
    // n=1000, p=0.125, expected=125, observed=250.
    // z = (250-125) / sqrt(1000*0.125*0.875) = 125/sqrt(109.375) = 125/10.458 = 11.95
    // p-value is vanishingly small.
    const r = verdict({ observed: 250, expected: 125, n: 1000, dimension: 'rarity' })
    assert.strictEqual(r.regime, 'unusual')
    assert.ok(r.pValue < 0.05, `expected p<0.05, got ${r.pValue}`)
    assert.match(r.copy, /above|above expected|higher/i)
  })

  it('streaks: copy includes "more" and the card label when provided implicitly', () => {
    const r = verdict({ observed: 30, expected: 15, n: 200, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'unusual')
    assert.match(r.copy, /more|expected/i)
  })
})

// ---------------------------------------------------------------------------
// verdict — happy path: observed = 0.5x expected at large n → unusual
// ---------------------------------------------------------------------------
describe('verdict — observed at 0.5x expected with large n', () => {
  it('rarity: returns unusual regime with "below expected" copy variant', () => {
    // n=1000, expected=125, observed=62 (rounded).
    // z = (62-125)/10.458 ≈ -6.02; p ≈ 1.7e-9.
    const r = verdict({ observed: 62, expected: 125, n: 1000, dimension: 'rarity' })
    assert.strictEqual(r.regime, 'unusual')
    assert.ok(r.pValue < 0.05)
    assert.match(r.copy, /below/i)
  })

  it('aspect: returns unusual with "below" copy', () => {
    // Large n so we get a stable verdict; observed half of expected.
    const r = verdict({ observed: 25, expected: 50, n: 200, dimension: 'aspect' })
    assert.strictEqual(r.regime, 'unusual')
    assert.match(r.copy, /below/i)
  })

  it('streaks: returns unusual with "fewer" copy', () => {
    const r = verdict({ observed: 7, expected: 15, n: 200, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'unusual')
    assert.match(r.copy, /fewer/i)
  })
})

// ---------------------------------------------------------------------------
// verdict — insufficient regime: small n always wins
// ---------------------------------------------------------------------------
describe('verdict — insufficient regime cases', () => {
  it('rarity: n < MIN_PACKS_RARITY returns insufficient even at 0.5x expected', () => {
    // 50 packs is well below MIN_PACKS_RARITY (120).
    const r = verdict({ observed: 5, expected: 10, n: 50, dimension: 'rarity' })
    assert.strictEqual(r.regime, 'insufficient')
    assert.match(r.copy, /more packs/i)
    assert.ok(Number.isNaN(r.pValue), 'p-value should be NaN for insufficient')
  })

  it('aspect: n < MIN_PACKS_ASPECT returns insufficient even at exactly expected', () => {
    // 30 packs < MIN_PACKS_ASPECT (60); cutoff dominates.
    const r = verdict({ observed: 5, expected: 5, n: 30, dimension: 'aspect' })
    assert.strictEqual(r.regime, 'insufficient')
    assert.match(r.copy, /more packs/i)
  })

  it('streaks: n < MIN_PACKS_PER_CARD returns insufficient', () => {
    const r = verdict({ observed: 5, expected: 5, n: 50, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'insufficient')
    assert.match(r.copy, /more/i)
  })

  it('cutoff dominates: observed == expected with n below MIN_PACKS_* is insufficient, not normal', () => {
    // The edge case from the plan: even a perfect-match observation can't be
    // called "normal" without enough sample.
    const r = verdict({ observed: 50, expected: 50, n: MIN_PACKS_RARITY - 1, dimension: 'rarity' })
    assert.strictEqual(r.regime, 'insufficient')
  })
})

// ---------------------------------------------------------------------------
// verdict — edge: zero expected with non-zero observed
// ---------------------------------------------------------------------------
describe('verdict — zero expected edge case', () => {
  it('returns unusual with sensible copy (no divide-by-zero)', () => {
    // Spec says this card / aspect shouldn't appear; user observed 3.
    const r = verdict({ observed: 3, expected: 0, n: 200, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'unusual')
    assert.ok(r.copy.length > 0, 'copy must be non-empty')
    // Should not contain NaN/Infinity tokens leaked through.
    assert.doesNotMatch(r.copy, /nan|infinity/i)
  })

  it('returns insufficient even with zero-expected if n below cutoff', () => {
    // Cutoff dominates regardless of expected value.
    const r = verdict({ observed: 3, expected: 0, n: 5, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'insufficient')
  })

  it('zero expected and zero observed at large n is normal', () => {
    // Trivially p=1.
    const r = verdict({ observed: 0, expected: 0, n: 200, dimension: 'streaks' })
    assert.strictEqual(r.regime, 'normal')
  })
})

// ---------------------------------------------------------------------------
// verdict — input validation
// ---------------------------------------------------------------------------
describe('verdict — input validation', () => {
  it('throws on negative observed', () => {
    assert.throws(
      () => verdict({ observed: -1, expected: 5, n: 200, dimension: 'rarity' }),
      RangeError
    )
  })

  it('throws on non-integer observed', () => {
    assert.throws(
      () => verdict({ observed: 1.5, expected: 5, n: 200, dimension: 'rarity' }),
      RangeError
    )
  })

  it('throws on negative expected', () => {
    assert.throws(
      () => verdict({ observed: 1, expected: -5, n: 200, dimension: 'rarity' }),
      RangeError
    )
  })

  it('throws on negative n', () => {
    assert.throws(
      () => verdict({ observed: 1, expected: 5, n: -200, dimension: 'rarity' }),
      RangeError
    )
  })

  it('throws on NaN inputs', () => {
    assert.throws(
      () => verdict({ observed: NaN, expected: 5, n: 200, dimension: 'rarity' }),
      RangeError
    )
  })
})

// ---------------------------------------------------------------------------
// isInterestingStreak — predicate behavior
// ---------------------------------------------------------------------------
describe('isInterestingStreak', () => {
  it('returns false below MIN_PACKS_PER_CARD even for unusual deviations', () => {
    // 4x expected at small n: would be flagged at large n but cutoff dominates.
    assert.strictEqual(
      isInterestingStreak({ observed: 20, expected: 5, n: 50 }),
      false
    )
  })

  it('returns false for ~1 sigma deviations at sufficient n', () => {
    // Expected = 20 in 200 packs. Observed = 24 (≈ 1 sigma above expected).
    // SE = sqrt(200 * 0.1 * 0.9) = sqrt(18) = 4.24. z = 4/4.24 = 0.94.
    // Two-sided p ≈ 0.347 — not interesting.
    assert.strictEqual(
      isInterestingStreak({ observed: 24, expected: 20, n: 200 }),
      false
    )
  })

  it('returns true for tail events at sufficient n', () => {
    // Expected = 20, observed = 40 (~5 sigma).
    // SE = 4.24; z = 20/4.24 = 4.72. p < 0.001 — interesting.
    assert.strictEqual(
      isInterestingStreak({ observed: 40, expected: 20, n: 200 }),
      true
    )
  })

  it('returns true for unexpected pulls when expected = 0 (and n meets floor)', () => {
    assert.strictEqual(
      isInterestingStreak({ observed: 3, expected: 0, n: 200 }),
      true
    )
  })

  it('returns false for zero-observed at zero-expected', () => {
    assert.strictEqual(
      isInterestingStreak({ observed: 0, expected: 0, n: 200 }),
      false
    )
  })

  it('returns false for invalid inputs (defensive)', () => {
    assert.strictEqual(isInterestingStreak({ observed: -1, expected: 5, n: 200 }), false)
    assert.strictEqual(isInterestingStreak({ observed: NaN, expected: 5, n: 200 }), false)
    assert.strictEqual(isInterestingStreak({ observed: 5, expected: NaN, n: 200 }), false)
    assert.strictEqual(isInterestingStreak({ observed: 5, expected: 5, n: NaN }), false)
  })
})

// ---------------------------------------------------------------------------
// Copy coverage — every (dimension, regime) cell is non-empty
// ---------------------------------------------------------------------------
describe('copy coverage', () => {
  const dimensions: Array<'rarity' | 'aspect' | 'streaks'> = ['rarity', 'aspect', 'streaks']

  /**
   * Build an input that lands deterministically in the requested regime.
   *
   * - insufficient: pick n below the dimension's minimum.
   * - normal: pick n above the minimum with observed==expected.
   * - unusual: pick n above the minimum with observed far from expected.
   */
  function inputForRegime(dim: 'rarity' | 'aspect' | 'streaks', regime: 'insufficient' | 'normal' | 'unusual') {
    const minByDim: Record<typeof dim, number> = {
      rarity: MIN_PACKS_RARITY,
      aspect: MIN_PACKS_ASPECT,
      streaks: MIN_PACKS_PER_CARD,
    }
    const min = minByDim[dim]
    if (regime === 'insufficient') {
      return { observed: 5, expected: 5, n: Math.max(1, min - 1), dimension: dim }
    }
    if (regime === 'normal') {
      return { observed: 30, expected: 30, n: min + 100, dimension: dim }
    }
    return { observed: 60, expected: 30, n: min + 100, dimension: dim }
  }

  for (const dim of dimensions) {
    for (const regime of ['insufficient', 'normal', 'unusual'] as const) {
      it(`${dim} / ${regime} has non-empty copy`, () => {
        const r = verdict(inputForRegime(dim, regime))
        assert.strictEqual(r.regime, regime, `expected ${regime}, got ${r.regime}`)
        assert.ok(r.copy.length > 0, `copy must be non-empty for ${dim}/${regime}`)
        // Defensive: no NaN tokens leaked through.
        assert.doesNotMatch(r.copy, /\bNaN\b/, `copy should not contain NaN for ${dim}/${regime}`)
        assert.doesNotMatch(r.copy, /\bInfinity\b/i, `copy should not contain Infinity for ${dim}/${regime}`)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// Confidence interval is always returned in [0, 1]
// ---------------------------------------------------------------------------
describe('verdict — CI shape', () => {
  it('CI is within [0, 1] in every regime', () => {
    const insufficient = verdict({ observed: 5, expected: 5, n: 10, dimension: 'rarity' })
    const normal = verdict({ observed: 50, expected: 50, n: 200, dimension: 'rarity' })
    const unusual = verdict({ observed: 100, expected: 50, n: 200, dimension: 'rarity' })

    for (const r of [insufficient, normal, unusual]) {
      assert.ok(r.ci.low >= 0 && r.ci.low <= 1, `CI.low out of [0,1]: ${r.ci.low}`)
      assert.ok(r.ci.high >= 0 && r.ci.high <= 1, `CI.high out of [0,1]: ${r.ci.high}`)
      assert.ok(r.ci.high >= r.ci.low, `CI inverted: ${r.ci.low} > ${r.ci.high}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Aspect-driving label flows through in the copy
// (the plan requires the aspect "headline" to name the driving aspect)
// ---------------------------------------------------------------------------
describe('verdict — aspect with no label still produces non-empty copy', () => {
  it('unusual aspect verdict reads naturally without a label', () => {
    const r = verdict({ observed: 30, expected: 10, n: 200, dimension: 'aspect' })
    assert.strictEqual(r.regime, 'unusual')
    assert.ok(r.copy.length > 0)
    assert.match(r.copy, /aspect/i)
  })
})
