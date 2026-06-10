/**
 * Luck Verdict Service
 *
 * Classifies an observed-vs-expected count into one of three regimes
 * (`insufficient`, `normal`, `unusual`), computes a two-sided p-value and 95%
 * Wilson confidence interval, and renders plain-English copy for the personal
 * stats UI.
 *
 * Pure functions only. No React, no I/O, no module-level mutable state. The
 * statistical primitives live in `@/src/utils/stats` — this file adds the
 * copy templates, the dimension-specific sample-size cutoff, and the streak
 * predicate.
 */

import {
  calculateZScore,
  calculateConfidenceInterval,
  twoSidedPValue,
  poissonTwoSidedPValue,
  MIN_PACKS_RARITY,
  MIN_PACKS_ASPECT,
  MIN_PACKS_PER_CARD,
} from '@/src/utils/stats'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Luck dimension being analyzed. `streaks` is the per-card dimension (one
 * specific card showed up more / less than expected). `rarity` is across the
 * four rarity buckets. `aspect` is across the six color aspects (plus
 * Neutral / Multicolor derived categories).
 */
export type LuckDimension = 'rarity' | 'aspect' | 'streaks'

/**
 * Three-regime verdict, simplified from the four-bucket pack-quality
 * classifier so the personal-stats UI only ever shows one of three states.
 *
 * - `insufficient`: sample size below the dimension's MIN_PACKS_* cutoff.
 *   We won't even render the verdict.
 * - `normal`: within typical variance. p-value ≥ 0.05.
 * - `unusual`: tail event. p-value < 0.05.
 */
export type LuckRegime = 'insufficient' | 'normal' | 'unusual'

export interface LuckVerdict {
  regime: LuckRegime
  pValue: number
  ci: { low: number; high: number }
  copy: string
}

export interface LuckVerdictInput {
  /** Count of items actually observed in the user's data. */
  observed: number
  /** Count expected from the spec-derived per-pack rates × n. */
  expected: number
  /** Total trials (packs cracked for rarity/aspect, packs cracked for streaks). */
  n: number
  /** Which dimension we're judging — drives both the cutoff and the copy. */
  dimension: LuckDimension
}

// ============================================================================
// COPY TEMPLATES
// ============================================================================

/**
 * Plain-English copy for every (dimension, regime) pair.
 *
 * Templates are functions of the verdict context so we can interpolate
 * observed/expected/percent values consistently. Per the plan, all nine cells
 * are non-empty — the original draft only specified the unusual + insufficient
 * cases and left "normal" implicit, which would have produced a blank panel
 * for the most common state.
 *
 * Tone: plain English, no jargon, no scolding. We don't tell users they're
 * "unlucky" — we tell them what their pull rate looks like and how it
 * compares to expectation. Tail-direction (above vs below) is determined at
 * render-time from observed vs expected.
 */
type CopyContext = {
  observed: number
  expected: number
  n: number
  /** Optional label (e.g., aspect name for aspect-driving copy). */
  label?: string
  /** "above expected" vs "below expected" — derived from observed vs expected. */
  direction?: 'above' | 'below' | 'equal'
}

type CopyFn = (ctx: CopyContext) => string

function relativePct(observed: number, expected: number): string {
  if (expected <= 0) return 'many times'
  const ratio = observed / expected
  return `${(ratio * 100).toFixed(0)}%`
}

const COPY_TEMPLATES: Record<LuckDimension, Record<LuckRegime, CopyFn>> = {
  // ---------------------------------------------------------------------------
  // RARITY — for the legendary/rare/uncommon/common distribution
  // ---------------------------------------------------------------------------
  rarity: {
    insufficient: (ctx) =>
      `Open a few more packs and we can tell you whether your rarities are typical. ` +
      `(${ctx.n} pack${ctx.n === 1 ? '' : 's'} so far — we need more to call it.)`,
    normal: () =>
      `Your rarity mix looks like a normal run. Nothing unusual showing up.`,
    unusual: (ctx) => {
      const dir = ctx.direction === 'below' ? 'below' : 'above'
      return (
        `Your rarity counts are running noticeably ${dir} expected. ` +
        `You pulled ${ctx.observed} where the spec predicts about ${ctx.expected.toFixed(1)} ` +
        `(${relativePct(ctx.observed, ctx.expected)} of expected).`
      )
    },
  },

  // ---------------------------------------------------------------------------
  // ASPECT — for the six-color distribution (per-aspect verdict)
  // ---------------------------------------------------------------------------
  aspect: {
    insufficient: (ctx) =>
      `Open a few more packs and we'll show you how your aspect mix compares. ` +
      `(${ctx.n} pack${ctx.n === 1 ? '' : 's'} so far.)`,
    normal: () =>
      `Your aspect mix looks like a normal spread across the six colors.`,
    unusual: (ctx) => {
      const dir = ctx.direction === 'below' ? 'below' : 'above'
      const label = ctx.label ? `Your ${ctx.label} share` : `One of your aspects`
      return (
        `${label} is meaningfully ${dir} expected — ` +
        `${ctx.observed} cards vs an expected ${ctx.expected.toFixed(1)}.`
      )
    },
  },

  // ---------------------------------------------------------------------------
  // STREAKS — for per-card pull frequencies
  // ---------------------------------------------------------------------------
  streaks: {
    insufficient: (ctx) =>
      `Streak analysis needs more packs to be meaningful. ` +
      `(${ctx.n} pack${ctx.n === 1 ? '' : 's'} so far — we look at individual cards once you cross our minimum.)`,
    normal: () =>
      `No card is showing up much more or less than expected. ` +
      `Nothing stands out as a streak.`,
    unusual: (ctx) => {
      const dir = ctx.direction === 'below' ? 'fewer' : 'more'
      const label = ctx.label ? ` of ${ctx.label}` : ''
      return (
        `You've pulled ${ctx.observed}${label}, ${dir} than the ${ctx.expected.toFixed(1)} ` +
        `we'd expect across ${ctx.n} pack${ctx.n === 1 ? '' : 's'}.`
      )
    },
  },
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Minimum number of packs at which we'll emit a non-`insufficient` verdict
 * for a given dimension. See `src/utils/stats.ts` for the derivation notes.
 */
function minPacksFor(dimension: LuckDimension): number {
  switch (dimension) {
    case 'rarity':
      return MIN_PACKS_RARITY
    case 'aspect':
      return MIN_PACKS_ASPECT
    case 'streaks':
      return MIN_PACKS_PER_CARD
  }
}

/**
 * Compute the two-sided p-value for observed vs expected with `n` trials.
 *
 * Uses the Poisson approximation when expected < 10 (rare events; normal
 * approximation under-counts the tails for low-count discrete data), and the
 * normal approximation otherwise. Cutoff is documented in the plan and is
 * standard practice; see Casella & Berger §10.4.
 */
function pValueFor(observed: number, expected: number, n: number, p: number): number {
  // Defensive: caller already special-cased zero-expected, but keep this
  // guard so callers exploring edge cases don't trip NaN.
  if (expected <= 0) {
    return observed === 0 ? 1 : 0
  }
  // Poisson for small expected (rare-event tails the normal approx underestimates)
  // OR when the per-trial rate p > 1 — color-aspect dimensions accumulate
  // multiple matches per pack (9 commons/pack × ~25% Vigilance share ≈ 2.25/pack),
  // so the binomial variance n*p*(1-p) becomes negative. Count data is naturally
  // Poisson-distributed; we use it whenever the binomial model doesn't apply.
  if (expected < 10 || p > 1) {
    return poissonTwoSidedPValue(observed, expected)
  }
  const z = calculateZScore(observed, expected, n, p)
  return twoSidedPValue(z)
}

/**
 * Direction of the deviation, used by the copy templates.
 */
function directionFor(observed: number, expected: number): 'above' | 'below' | 'equal' {
  if (observed > expected) return 'above'
  if (observed < expected) return 'below'
  return 'equal'
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Verdict for one luck dimension.
 *
 * Throws on negative `observed` or `n` — those are caller bugs, not edge
 * cases. Tolerates zero `expected` (returns `unusual` with sensible copy as
 * long as `n` meets the threshold and `observed > 0`).
 *
 * @param input.observed - count actually observed (≥ 0, integer)
 * @param input.expected - count expected from the spec (≥ 0, may be non-integer)
 * @param input.n - total trials (packs cracked) (≥ 0, integer)
 * @param input.dimension - which dimension is being judged
 */
export function verdict(input: LuckVerdictInput): LuckVerdict {
  const { observed, expected, n, dimension } = input

  // Hard input validation — these are programmer errors, not edge cases.
  if (!Number.isFinite(observed) || observed < 0 || !Number.isInteger(observed)) {
    throw new RangeError(`verdict: observed must be a non-negative integer, got ${observed}`)
  }
  if (!Number.isFinite(expected) || expected < 0) {
    throw new RangeError(`verdict: expected must be a non-negative finite number, got ${expected}`)
  }
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new RangeError(`verdict: n must be a non-negative integer, got ${n}`)
  }

  const minPacks = minPacksFor(dimension)
  const direction = directionFor(observed, expected)

  // --- Insufficient sample size ---
  // The cutoff dominates: even if observed == expected exactly, we don't
  // claim "normal" below MIN_PACKS_* — the CI is too wide to make any call.
  if (n < minPacks) {
    return {
      regime: 'insufficient',
      pValue: NaN,
      ci: calculateConfidenceInterval(observed, n),
      copy: COPY_TEMPLATES[dimension].insufficient({ observed, expected, n }),
    }
  }

  // --- Zero-expected defensive case ---
  // The spec says this dimension should never happen at this rate, but the
  // user observed something. p-value formally undefined (no model), but we
  // surface it as `unusual` with a clear copy line. Avoids divide-by-zero in
  // the z-score path.
  if (expected === 0 && observed > 0) {
    return {
      regime: 'unusual',
      pValue: 0,
      ci: calculateConfidenceInterval(observed, n),
      copy: COPY_TEMPLATES[dimension].unusual({ observed, expected, n, direction }),
    }
  }

  // --- p-value & CI ---
  // p = expected / n is the per-trial success probability used for the
  // z-score's standard error. For very small n*p (expected < 10) we route
  // through the Poisson approximation; otherwise normal.
  const p = n > 0 ? expected / n : 0
  const pValue = pValueFor(observed, expected, n, p)
  // Wilson CI assumes p ∈ [0, 1] (success/trial). For color-aspect data where
  // multiple matches per pack push observed > n, Wilson produces NaN bounds.
  // Use a Poisson-normal CI on the rate directly: rate = observed/n ± 1.96 ·
  // sqrt(observed)/n. No [0, 1] clamp — rates > 1 are meaningful here.
  const ci =
    p > 1
      ? (() => {
          const rate = n > 0 ? observed / n : 0
          const se = n > 0 ? Math.sqrt(observed) / n : 0
          return { low: Math.max(0, rate - 1.96 * se), high: rate + 1.96 * se }
        })()
      : calculateConfidenceInterval(observed, n)

  // --- Regime selection ---
  // Two-sided p < 0.05 is the conventional cutoff for "unusual." This matches
  // the standard significance threshold and gives the streak-filter predicate
  // its meaning (see isInterestingStreak below).
  const regime: LuckRegime = pValue < 0.05 ? 'unusual' : 'normal'

  const copy = COPY_TEMPLATES[dimension][regime]({ observed, expected, n, direction })

  return { regime, pValue, ci, copy }
}

/**
 * Predicate: is this card's pull history statistically interesting enough to
 * surface in the streaks list?
 *
 * Returns true when:
 *  1. We have enough packs to bother looking (n >= MIN_PACKS_PER_CARD), AND
 *  2. The two-sided p-value is below 0.05 (the conventional cutoff for
 *     "unusual"). Same threshold the verdict() function uses for `unusual`.
 *
 * `expected` is allowed to be zero — in that case we treat any non-zero
 * observed as interesting (the user pulled a card the spec said shouldn't
 * appear at all, which is structurally surprising). The aspect/rarity
 * verdicts surface this via the zero-expected branch in `verdict()`; the
 * streak predicate keeps the same defensive behavior.
 */
export function isInterestingStreak(input: {
  observed: number
  expected: number
  n: number
}): boolean {
  const { observed, expected, n } = input

  if (!Number.isFinite(observed) || observed < 0) return false
  if (!Number.isFinite(expected) || expected < 0) return false
  if (!Number.isFinite(n) || n < 0) return false

  if (n < MIN_PACKS_PER_CARD) return false

  if (expected === 0) {
    // Caller observed a card the spec said shouldn't exist — flag it.
    return observed > 0
  }

  const p = n > 0 ? expected / n : 0
  const pValue = pValueFor(observed, expected, n, p)
  return pValue < 0.05
}

/**
 * Cutoff exposed for tests and external callers (e.g., the API endpoint U6
 * needs to know which n value to compare against per-dimension).
 *
 * Re-exports the constants from `src/utils/stats.ts` so consumers can import
 * everything they need from one place rather than reaching across files.
 */
export { MIN_PACKS_RARITY, MIN_PACKS_ASPECT, MIN_PACKS_PER_CARD }
