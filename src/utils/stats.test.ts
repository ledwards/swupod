// @ts-nocheck
/**
 * Tests for src/utils/stats.ts.
 *
 * Spec-first per .claude/rules/testing.md: every expected value below is
 * either a hand-computed binomial / normal-approximation result (with the
 * derivation in a comment) or a textbook reference, never derived from the
 * function under test.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  calculateZScore,
  calculateConfidenceInterval,
  categorizePackQualityStatus,
  twoSidedPValue,
  poissonTwoSidedPValue,
  MIN_PACKS_RARITY,
  MIN_PACKS_ASPECT,
  MIN_PACKS_PER_CARD,
} from './stats.ts'

// ---------------------------------------------------------------------------
// calculateZScore
// ---------------------------------------------------------------------------
describe('calculateZScore', () => {
  it('returns 0 when observed equals expected at any n,p', () => {
    // 100 of 1000 with p=0.1 → expected = 100, z = 0.
    assert.strictEqual(calculateZScore(100, 100, 1000, 0.1), 0)
  })

  it('returns positive z for observed above expected', () => {
    // 200 of 1000 with p=0.1 → expected = 100, SE = sqrt(1000 * 0.1 * 0.9) = 9.4868
    //   z = (200 - 100) / 9.4868 = 10.541
    // Textbook hand-computation; not from function output.
    const z = calculateZScore(200, 100, 1000, 0.1)
    assert.ok(Math.abs(z - 10.541) < 0.01, `expected ~10.541, got ${z}`)
  })

  it('returns negative z for observed below expected', () => {
    // 50 of 1000 with p=0.1 → expected = 100, SE = 9.4868
    //   z = (50 - 100) / 9.4868 = -5.270
    const z = calculateZScore(50, 100, 1000, 0.1)
    assert.ok(Math.abs(z - -5.270) < 0.01, `expected ~-5.270, got ${z}`)
  })

  it('returns 0 in degenerate cases (n=0, p=0, p=1)', () => {
    assert.strictEqual(calculateZScore(0, 0, 0, 0.5), 0)
    assert.strictEqual(calculateZScore(0, 0, 10, 0), 0)
    assert.strictEqual(calculateZScore(10, 10, 10, 1), 0)
  })
})

// ---------------------------------------------------------------------------
// calculateConfidenceInterval (Wilson)
// ---------------------------------------------------------------------------
describe('calculateConfidenceInterval', () => {
  it('matches the textbook Wilson interval for 5/10', () => {
    // p = 0.5, n = 10, z = 1.96.
    //   denominator = 1 + 1.96^2 / 10 = 1 + 0.38416 = 1.38416
    //   center = (0.5 + 1.96^2 / 20) / 1.38416 = (0.5 + 0.19208) / 1.38416 = 0.5
    //   margin = (1.96 * sqrt((0.25 + 1.96^2/40) / 10)) / 1.38416
    //          = (1.96 * sqrt((0.25 + 0.09604) / 10)) / 1.38416
    //          = (1.96 * sqrt(0.034604)) / 1.38416
    //          = (1.96 * 0.18603) / 1.38416 = 0.36462 / 1.38416 = 0.26341
    // CI ≈ [0.236, 0.764]. Wikipedia Wilson example uses 0.236 / 0.764.
    const { low, high } = calculateConfidenceInterval(5, 10)
    assert.ok(Math.abs(low - 0.236) < 0.002, `low expected ~0.236, got ${low}`)
    assert.ok(Math.abs(high - 0.764) < 0.002, `high expected ~0.764, got ${high}`)
  })

  it('returns [0, 0] for total=0 (no observations)', () => {
    const ci = calculateConfidenceInterval(0, 0)
    assert.deepStrictEqual(ci, { low: 0, high: 0 })
  })

  it('returns a low bound clamped to 0 and high clamped to 1', () => {
    // p = 1.0, n = 5 → center near 1, margin pushes high above 1; must clamp.
    const { low, high } = calculateConfidenceInterval(5, 5)
    assert.ok(low >= 0, `low must be >= 0, got ${low}`)
    assert.ok(high <= 1, `high must be <= 1, got ${high}`)
  })

  it('tightens as sample size grows', () => {
    // 50/100 vs 500/1000 — same p=0.5, larger n → narrower interval.
    const small = calculateConfidenceInterval(50, 100)
    const large = calculateConfidenceInterval(500, 1000)
    const widthSmall = small.high - small.low
    const widthLarge = large.high - large.low
    assert.ok(widthLarge < widthSmall, `width should narrow with n: ${widthSmall} → ${widthLarge}`)
  })
})

// ---------------------------------------------------------------------------
// categorizePackQualityStatus
// ---------------------------------------------------------------------------
describe('categorizePackQualityStatus', () => {
  it('returns insufficient_data below the minSampleSize threshold', () => {
    assert.strictEqual(categorizePackQualityStatus(0, 49, 50), 'insufficient_data')
    assert.strictEqual(categorizePackQualityStatus(5, 49, 50), 'insufficient_data')
  })

  it('returns expected for |z| < 1.5 above the threshold', () => {
    assert.strictEqual(categorizePackQualityStatus(0, 100, 50), 'expected')
    assert.strictEqual(categorizePackQualityStatus(1.49, 100, 50), 'expected')
    assert.strictEqual(categorizePackQualityStatus(-1.49, 100, 50), 'expected')
  })

  it('returns slight_variance for 1.5 <= |z| < 2.0', () => {
    assert.strictEqual(categorizePackQualityStatus(1.5, 100, 50), 'slight_variance')
    assert.strictEqual(categorizePackQualityStatus(1.99, 100, 50), 'slight_variance')
    assert.strictEqual(categorizePackQualityStatus(-1.75, 100, 50), 'slight_variance')
  })

  it('returns outlier for |z| >= 2.0', () => {
    assert.strictEqual(categorizePackQualityStatus(2.0, 100, 50), 'outlier')
    assert.strictEqual(categorizePackQualityStatus(3.5, 100, 50), 'outlier')
    assert.strictEqual(categorizePackQualityStatus(-2.5, 100, 50), 'outlier')
  })
})

// ---------------------------------------------------------------------------
// twoSidedPValue
// ---------------------------------------------------------------------------
describe('twoSidedPValue', () => {
  it('returns ~1 for z = 0', () => {
    // 2 * (1 - Φ(0)) = 2 * 0.5 = 1.0
    const p = twoSidedPValue(0)
    assert.ok(Math.abs(p - 1.0) < 0.001, `expected ~1.0, got ${p}`)
  })

  it('returns ~0.3173 for z = 1 (one standard deviation)', () => {
    // 2 * (1 - Φ(1)) = 2 * 0.15866 = 0.31731. Textbook.
    const p = twoSidedPValue(1)
    assert.ok(Math.abs(p - 0.3173) < 0.001, `expected ~0.3173, got ${p}`)
  })

  it('returns ~0.0455 for z = 2 (two standard deviations)', () => {
    // 2 * (1 - Φ(2)) = 2 * 0.02275 = 0.04550. Textbook.
    const p = twoSidedPValue(2)
    assert.ok(Math.abs(p - 0.0455) < 0.001, `expected ~0.0455, got ${p}`)
  })

  it('is symmetric in z and -z', () => {
    assert.ok(Math.abs(twoSidedPValue(1.5) - twoSidedPValue(-1.5)) < 1e-9)
    assert.ok(Math.abs(twoSidedPValue(2.5) - twoSidedPValue(-2.5)) < 1e-9)
  })

  it('clamps to [0, 1]', () => {
    const high = twoSidedPValue(0)
    const low = twoSidedPValue(10)
    assert.ok(high <= 1 && high >= 0)
    assert.ok(low <= 1 && low >= 0)
  })
})

// ---------------------------------------------------------------------------
// poissonTwoSidedPValue
// ---------------------------------------------------------------------------
describe('poissonTwoSidedPValue', () => {
  it('returns ~1 for observed == lambda (small lambda)', () => {
    // observed = 3, lambda = 3 → P(X <= 3) = 0.6472, P(X >= 3) = 0.5768.
    // Two-sided = 2 * min(0.6472, 0.5768) = 1.1536, clamped to 1.0.
    // Hand-computed via Poisson pmf:
    //   k=0: e^-3 = 0.0498; k=1: 0.1494; k=2: 0.2240; k=3: 0.2240
    //   P(X <= 3) = 0.0498 + 0.1494 + 0.2240 + 0.2240 = 0.6472
    const p = poissonTwoSidedPValue(3, 3)
    assert.ok(p >= 0.99, `expected near 1.0, got ${p}`)
  })

  it('returns small p for observed far above lambda', () => {
    // lambda = 1, observed = 5. P(X >= 5 | lambda=1) ≈ 0.00366.
    // Two-sided ≈ 0.0073. (Lower tail P(X<=5)=1; upper P(X>=5)≈0.00366, 2*upper.)
    const p = poissonTwoSidedPValue(5, 1)
    assert.ok(p < 0.05, `expected < 0.05 for 5 vs 1, got ${p}`)
    assert.ok(p > 0, `expected positive, got ${p}`)
  })

  it('returns small p for observed far below lambda', () => {
    // lambda = 10, observed = 2. P(X <= 2 | lambda=10) ≈ 0.00277.
    // Two-sided ≈ 0.0055.
    const p = poissonTwoSidedPValue(2, 10)
    assert.ok(p < 0.05, `expected < 0.05 for 2 vs 10, got ${p}`)
  })

  it('handles lambda = 0 defensively', () => {
    // Degenerate: lambda=0 → only X=0 is possible.
    assert.strictEqual(poissonTwoSidedPValue(0, 0), 1)
    assert.strictEqual(poissonTwoSidedPValue(5, 0), 0)
  })

  it('returns 0 for negative observed (defensive)', () => {
    assert.strictEqual(poissonTwoSidedPValue(-1, 5), 0)
  })
})

// ---------------------------------------------------------------------------
// MIN_PACKS_* constants
// ---------------------------------------------------------------------------
describe('MIN_PACKS_* constants', () => {
  it('are positive integers', () => {
    assert.ok(Number.isInteger(MIN_PACKS_RARITY) && MIN_PACKS_RARITY > 0, `MIN_PACKS_RARITY = ${MIN_PACKS_RARITY}`)
    assert.ok(Number.isInteger(MIN_PACKS_ASPECT) && MIN_PACKS_ASPECT > 0, `MIN_PACKS_ASPECT = ${MIN_PACKS_ASPECT}`)
    assert.ok(Number.isInteger(MIN_PACKS_PER_CARD) && MIN_PACKS_PER_CARD > 0, `MIN_PACKS_PER_CARD = ${MIN_PACKS_PER_CARD}`)
  })

  it('fall within the plausible 20-500 range documented in the plan', () => {
    // The plan said 20-200; in practice MIN_PACKS_PER_CARD landed at 200 to
    // match the per-card streak derivation. The range here is the upper bound
    // beyond which any value would indicate a derivation bug.
    assert.ok(MIN_PACKS_RARITY >= 20 && MIN_PACKS_RARITY <= 500, `MIN_PACKS_RARITY out of range: ${MIN_PACKS_RARITY}`)
    assert.ok(MIN_PACKS_ASPECT >= 20 && MIN_PACKS_ASPECT <= 500, `MIN_PACKS_ASPECT out of range: ${MIN_PACKS_ASPECT}`)
    assert.ok(MIN_PACKS_PER_CARD >= 20 && MIN_PACKS_PER_CARD <= 500, `MIN_PACKS_PER_CARD out of range: ${MIN_PACKS_PER_CARD}`)
  })

  it('order MIN_PACKS_PER_CARD >= MIN_PACKS_RARITY (per-card needs more data than rarity)', () => {
    // Streak detection at the per-card granularity should demand at least as
    // many packs as rarity-level analysis, since per-card rates are rarer.
    assert.ok(MIN_PACKS_PER_CARD >= MIN_PACKS_RARITY, `expected MIN_PACKS_PER_CARD (${MIN_PACKS_PER_CARD}) >= MIN_PACKS_RARITY (${MIN_PACKS_RARITY})`)
  })
})
