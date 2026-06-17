/**
 * Pack Fidelity Service
 *
 * Compares ACTUAL production pack pulls against the precomputed THEORETICAL
 * distribution (src/data/packTheory.json, produced by scripts/computePackTheory.ts
 * via Monte-Carlo of the real generator).
 *
 * Pure functions only — no React, no I/O. Consumed by both the offline report
 * script (scripts/comparePackActuals.ts) and the live stats API, so the verdict
 * math lives in exactly one place.
 *
 * WHY A z-TEST AND NOT chi-square
 * ================================
 * The belt/collation system produces SUB-Poisson, constrained counts: every
 * pack has exactly 16 cards, exactly one leader, the hopper is drawn without
 * replacement, etc. A chi-square / multinomial test assumes Poisson-ish
 * variance and would systematically over- or under-state significance here.
 * Instead we use the per-pack standard deviation measured by the Monte-Carlo
 * (theory.sd) and the Central Limit Theorem: over M independent packs the
 * observed total is ~Normal(mean*M, (sd*sqrt(M))^2). z = (obs - mean*M)/(sd*sqrt(M)).
 */

import { twoSidedPValue } from '@/src/utils/stats'

export interface TheoryBucket {
  /** Mean count of this bucket per pack, from Monte-Carlo. */
  mean: number
  /** Per-pack standard deviation of that count. 0 ⇒ deterministic slot. */
  sd: number
}

/** Practical-significance verdict, combining statistical and effect-size tests. */
export type FidelityLabel = 'aligned' | 'minor' | 'notable' | 'deterministic-mismatch'

export interface FidelityVerdict {
  bucket: string
  expectedPerPack: number
  expectedTotal: number
  actualTotal: number
  actualPerPack: number
  /** Relative deviation of the per-pack rate, (actual - expected) / expected. */
  relDev: number
  /** Null when the theory slot is deterministic (sd === 0). */
  z: number | null
  pValue: number | null
  label: FidelityLabel
}

export interface FidelityOptions {
  /** Two-sided p below this counts as statistically significant. Default 0.01. */
  alpha?: number
  /** Min |relDev| to call a significant result "notable" vs "minor". Default 0.05 (5%). */
  effectFloor?: number
}

/**
 * Compare one dimension (a set of mutually-exclusive buckets — e.g. the rarity
 * buckets, or the variant buckets) of actuals against theory over `packs` packs.
 *
 * `actual` need not contain every theory bucket; missing buckets are treated as
 * observed-zero. Buckets present in `actual` but absent from `theory` are still
 * reported (expected 0) so unexpected categories surface.
 */
export function compareDimension(
  theory: Record<string, TheoryBucket>,
  actual: Record<string, number>,
  packs: number,
  opts: FidelityOptions = {},
): FidelityVerdict[] {
  const alpha = opts.alpha ?? 0.01
  const effectFloor = opts.effectFloor ?? 0.05
  const keys = Array.from(new Set([...Object.keys(theory), ...Object.keys(actual)]))

  return keys.map((bucket) => {
    const t = theory[bucket] ?? { mean: 0, sd: 0 }
    const actualTotal = actual[bucket] ?? 0
    const expectedTotal = t.mean * packs
    const expectedPerPack = t.mean
    const actualPerPack = packs > 0 ? actualTotal / packs : 0
    const relDev = expectedPerPack > 0 ? (actualPerPack - expectedPerPack) / expectedPerPack : (actualPerPack > 0 ? Infinity : 0)

    // Deterministic theory slot: no variance to test against. Flag only a
    // material divergence from the fixed rate (≥1% per-pack) — a handful of
    // odd rows shouldn't read as a structural break.
    if (t.sd === 0) {
      const mismatch = expectedPerPack > 0 ? Math.abs(relDev) >= 0.01 : actualTotal > 0
      return {
        bucket,
        expectedPerPack,
        expectedTotal,
        actualTotal,
        actualPerPack,
        relDev,
        z: null,
        pValue: null,
        label: mismatch ? 'deterministic-mismatch' : 'aligned',
      }
    }

    const se = t.sd * Math.sqrt(Math.max(packs, 0))
    const z = se > 0 ? (actualTotal - expectedTotal) / se : 0
    const pValue = twoSidedPValue(z)

    let label: FidelityLabel = 'aligned'
    if (pValue < alpha) {
      // Statistically significant. Large M makes trivial gaps significant, so
      // gate the "notable" call on a real effect size too.
      label = Math.abs(relDev) >= effectFloor ? 'notable' : 'minor'
    }

    return { bucket, expectedPerPack, expectedTotal, actualTotal, actualPerPack, relDev, z, pValue, label }
  })
}

/** True if any verdict in the dimension is a real divergence worth a callout. */
export function dimensionHasDivergence(verdicts: FidelityVerdict[]): boolean {
  return verdicts.some((v) => v.label === 'notable' || v.label === 'deterministic-mismatch')
}
