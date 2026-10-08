/**
 * Statistical primitives shared by `packQualityService` and `luckVerdict`.
 *
 * Extracted from `src/services/packQualityService.ts` so that the pack quality
 * dashboard (audience: "is our generator honest?") and the personal luck
 * analyzer (audience: "is my pull history weird?") share one implementation of
 * the underlying math. Eliminates the risk of two diverging approximations.
 *
 * NO React, NO I/O, NO module-level mutable state. Pure functions only.
 */

// ============================================================================
// Z-SCORE FOR A PROPORTION
// ============================================================================

/**
 * Z-score for an observed count against a binomial expectation.
 *
 * - `observed`: count of successes seen.
 * - `expected`: expected count = n * p.
 * - `n`: number of trials.
 * - `p`: probability of success per trial.
 *
 * Returns 0 in degenerate cases (n=0, p=0, p=1) so consumers never have to
 * special-case NaN/Infinity. They can rely on the regime classifier to surface
 * "insufficient_data" when n is small.
 */
export function calculateZScore(
  observed: number,
  expected: number,
  n: number,
  p: number
): number {
  if (n === 0 || p === 0 || p === 1) return 0
  const standardError = Math.sqrt(n * p * (1 - p))
  if (standardError === 0) return 0
  return (observed - expected) / standardError
}

// ============================================================================
// WILSON SCORE CONFIDENCE INTERVAL
// ============================================================================

/**
 * Wilson score interval for a binomial proportion.
 *
 * Preferred over the normal-approximation interval because Wilson is well-
 * behaved at p near 0 or 1, which matters for our rarest dimensions
 * (Legendary at ~1/128 per card; per-card streaks at p ~ 1/many).
 *
 * Reference: Wilson (1927), as summarized in
 * https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval
 *
 * `confidence` defaults to 0.95 (z=1.96); 0.99 uses z=2.576. Any other value
 * falls back to z=1.96 — the existing packQualityService callers only use the
 * 0.95 path, but the parameter is preserved for parity.
 */
export function calculateConfidenceInterval(
  successes: number,
  total: number,
  confidence: number = 0.95
): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 0 }

  // Z-score for confidence level (1.96 for 95%, 2.576 for 99%).
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.96
  const p = successes / total
  const n = total

  const denominator = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denominator

  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  }
}

// ============================================================================
// REGIME CLASSIFIER (packQualityService four-bucket version)
// ============================================================================

/**
 * Four-bucket regime classifier used by `packQualityService`.
 *
 * - `insufficient_data`: not enough trials to make a call (n < minSampleSize).
 * - `expected`: |z| < 1.5.
 * - `slight_variance`: 1.5 ≤ |z| < 2.0.
 * - `outlier`: |z| ≥ 2.0.
 *
 * `luckVerdict` collapses these into the three regimes the personal-stats UI
 * uses (`insufficient | normal | unusual`); see `luckVerdict.ts` for the
 * mapping. We keep both classifiers separate because the pack-quality
 * dashboard intentionally distinguishes `expected` from `slight_variance` and
 * we don't want to change its output.
 */
export type PackQualityStatus =
  | 'expected'
  | 'slight_variance'
  | 'outlier'
  | 'insufficient_data'

export function categorizePackQualityStatus(
  zScore: number,
  sampleSize: number,
  minSampleSize: number = 50
): PackQualityStatus {
  if (sampleSize < minSampleSize) return 'insufficient_data'
  const absZ = Math.abs(zScore)
  if (absZ < 1.5) return 'expected'
  if (absZ < 2.0) return 'slight_variance'
  return 'outlier'
}

// ============================================================================
// MINIMUM SAMPLE SIZE CONSTANTS
// ============================================================================

/*
 * The constants below define the smallest n for which `luckVerdict` will
 * issue a non-`insufficient` regime. Each is the smallest integer n at which
 * the 95% Wilson CI of the observed rate excludes ±50% relative deviation
 * from the median per-pack rate of that dimension.
 *
 * Derivation (normal approximation to Wilson, half-width on rate):
 *
 *   1.96 * sqrt(p * (1 - p) / n) <= 0.5 * p
 *   n >= (1.96 / 0.5)^2 * (1 - p) / p
 *   n >= 15.366 * (1 - p) / p
 *
 * where `p` is the per-trial probability of the median member of the
 * dimension. We round up to an integer and then up to a clean number for
 * readability. These values are checked in; tunable post-launch if telemetry
 * shows the `insufficient` regime fires too often.
 *
 * --- MIN_PACKS_RARITY ---
 * The rarity dimension has four buckets: Common (~9/16 per card = 0.5625),
 * Uncommon (~3/16 = 0.1875), Rare (~7/8 of the R/L slot / 16 = 0.0547), and
 * Legendary (~1/8 of the R/L slot / 16 = 0.0078).
 *
 * The driving constraint is Legendary, the rarest bucket. Per PACK there is
 * one R/L slot with a ~1/8 Legendary rate (`beltRatios.rareToLegendary = 7:1`
 * for Set 7+). So per pack, p_legendary = 1/8 = 0.125.
 *
 *   n >= 15.366 * (1 - 0.125) / 0.125 = 15.366 * 7 = 107.6 -> 108 packs
 *
 * Rounded up to 120 to give a small safety margin and a clean number.
 *
 * --- MIN_PACKS_ASPECT ---
 * Six aspect buckets (Vigilance, Command, Aggression, Cunning, Heroism,
 * Villainy) plus derived Neutral and Multicolor categories. The pack
 * guarantees every aspect appears at least once, so the per-aspect per-card
 * rate is ~1/6 over non-leader-base color cards. With ~14 color cards per
 * pack, expected per-aspect per pack = 14/6 ≈ 2.33.
 *
 * We pin the constraint on the per-CARD aspect rate, which is the granularity
 * the verdict will actually examine: p_aspect ≈ 1/6 = 0.1667. We need enough
 * card draws total to nail down the CI:
 *
 *   n_cards >= 15.366 * (1 - 1/6) / (1/6) = 15.366 * 5 = 76.83 cards
 *
 * At ~14 color cards per pack: 76.83 / 14 ≈ 5.5 packs. That's too aggressive
 * for a "we won't even render the verdict" cutoff — players seeing 6 packs
 * should not be told "you have Heroism-bias." We bump the floor to require a
 * meaningful number of packs as well as cards: minimum 60 packs (~840 color
 * cards), which gives a much tighter CI for the median aspect AND prevents
 * fringe cases like "I cracked one pack and got two Heroism cards" from
 * triggering an aspect verdict.
 *
 * MIN_PACKS_ASPECT = 60
 *
 * --- MIN_PACKS_PER_CARD ---
 * Streak detection runs against individual base-belt cards. The driving
 * constraint is moderate-rarity cards: a typical uncommon at ~3 uncommons/pack
 * over a ~40-card uncommon pool has p ≈ 3/(16 * 40) per card draw ≈ 0.0047,
 * or about 3/40 = 0.075 per pack.
 *
 *   n >= 15.366 * (1 - 0.075) / 0.075 = 15.366 * 12.33 = 189.5 -> 190 packs
 *
 * Rounded up to 200 for a clean number. Note: the streak check is itself
 * additionally gated by isInterestingStreak (p < 0.05), so this floor only
 * sets the "we won't even look at streaks below this n" threshold.
 *
 * MIN_PACKS_PER_CARD = 200
 */
export const MIN_PACKS_RARITY = 120
export const MIN_PACKS_ASPECT = 60
export const MIN_PACKS_PER_CARD = 200

// ============================================================================
// TWO-SIDED P-VALUE FROM Z (for luckVerdict)
// ============================================================================

/**
 * Two-sided p-value from a z-score using the standard-normal CDF.
 *
 * Uses Abramowitz & Stegun 26.2.17 rational approximation (max abs error
 * < 7.5e-8). Identical method to the chi-squared approximation already in
 * `packQualityService`; kept here so `luckVerdict` doesn't reach across into
 * another service for a private helper.
 *
 * Returns 2 * (1 - Φ(|z|)) clamped to [0, 1].
 */
export function twoSidedPValue(zScore: number): number {
  const absZ = Math.abs(zScore)
  // 1 - Φ(absZ) upper tail probability via Abramowitz & Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * absZ)
  const d = 0.3989422804014327 * Math.exp((-absZ * absZ) / 2)
  const upper =
    d *
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const p = 2 * upper
  if (p < 0) return 0
  if (p > 1) return 1
  return p
}

/**
 * Poisson upper-tail probability P(X >= observed) given lambda, computed by
 * summing P(X = k) for k = 0..observed-1 and returning 1 - that.
 *
 * Used by `luckVerdict` for the small-expected case (expected < 10) where
 * the normal approximation underestimates tail probabilities. Two-sided
 * version is `2 * min(P(X >= observed), P(X <= observed))` clamped to 1.
 *
 * `observed` must be a non-negative integer. `lambda` must be > 0; lambda=0
 * means "no events ever expected" and is handled by the caller (any non-zero
 * observed is unusual, but the question of "how unusual" is degenerate).
 */
export function poissonTwoSidedPValue(observed: number, lambda: number): number {
  if (lambda <= 0) {
    // Degenerate: P(X = 0) = 1 under lambda=0. Caller should special-case
    // before calling; we return a defensive 1 for lambda=0, observed=0 and
    // 0 for any positive observed.
    return observed === 0 ? 1 : 0
  }
  if (observed < 0) return 0
  const k = Math.floor(observed)

  // Compute P(X <= k) by accumulating Poisson pmf:
  // pmf(0) = e^-lambda; pmf(i) = pmf(i-1) * lambda / i.
  let pmf = Math.exp(-lambda)
  let cumLE = pmf
  for (let i = 1; i <= k; i++) {
    pmf = (pmf * lambda) / i
    cumLE += pmf
  }
  // P(X <= k-1) — needed for upper tail P(X >= k).
  const cumLT = cumLE - pmf
  const lowerTail = cumLE // P(X <= observed)
  const upperTail = 1 - cumLT // P(X >= observed)

  // Two-sided: doubling the smaller tail, clamped to 1. Standard convention
  // for discrete distributions ("min(2*min(L,U), 1)").
  const twoSided = 2 * Math.min(lowerTail, upperTail)
  return Math.min(1, Math.max(0, twoSided))
}
