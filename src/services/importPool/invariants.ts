// @ts-nocheck
/**
 * Sealed-pool extraction invariants.
 *
 * The user-visible goal of an Import Pool extraction is hitting four
 * structural totals that any legal sealed pool must satisfy:
 *
 *   - sum(poolQty) === 96             (6 packs × 16 cards)
 *   - 30 ≤ sum(deckQty) ≤ 35          (30-card minimum, ~32 typical with leader+base)
 *   - sum(leader poolQty) === 6       (one leader per pack)
 *   - sum(base poolQty) === 6         (one base per pack)
 *   - deckQty ≤ poolQty per row       (deck is a subset of pool)
 *
 * These are auto-checkable without per-card ground truth. The runtime
 * extraction loop uses `checkInvariants` as the convergence test; when
 * it fails, `describeGap` produces the user-message text fed back into
 * the next refine pass.
 */

export const POOL_TARGET = 96
export const DECK_MIN = 30
export const DECK_MAX = 35
export const LEADER_TARGET = 6
export const BASE_TARGET = 6

export interface ExtractionInvariantStatus {
  passing: boolean
  poolSum: number
  deckSum: number
  leaderCount: number
  baseCount: number
  subsetViolations: number
  unreadableCount: number
  failures: string[]
}

interface InvariantInputRow {
  name?: string
  type?: string
  poolQty?: number
  deckQty?: number
}

export function checkInvariants(rows: InvariantInputRow[]): ExtractionInvariantStatus {
  let poolSum = 0
  let deckSum = 0
  let leaderCount = 0
  let baseCount = 0
  let subsetViolations = 0
  let unreadableCount = 0

  for (const r of rows) {
    const p = Number(r.poolQty) || 0
    const d = Number(r.deckQty) || 0
    poolSum += p
    deckSum += d
    if (r.type === 'Leader') leaderCount += p
    if (r.type === 'Base') baseCount += p
    if (d > p) subsetViolations++
    if (typeof r.name === 'string' && r.name.trim() === '?') unreadableCount++
  }

  const failures: string[] = []
  if (poolSum !== POOL_TARGET) {
    failures.push(`poolSum=${poolSum}, expected ${POOL_TARGET} (gap: ${POOL_TARGET - poolSum})`)
  }
  if (deckSum < DECK_MIN || deckSum > DECK_MAX) {
    failures.push(`deckSum=${deckSum}, expected ${DECK_MIN}-${DECK_MAX}`)
  }
  if (leaderCount !== LEADER_TARGET) {
    failures.push(`leaderCount=${leaderCount}, expected ${LEADER_TARGET}`)
  }
  if (baseCount !== BASE_TARGET) {
    failures.push(`baseCount=${baseCount}, expected ${BASE_TARGET}`)
  }
  if (subsetViolations > 0) {
    failures.push(`${subsetViolations} rows with deckQty > poolQty`)
  }

  return {
    passing: failures.length === 0,
    poolSum,
    deckSum,
    leaderCount,
    baseCount,
    subsetViolations,
    unreadableCount,
    failures,
  }
}

/**
 * Score a status: lower is closer to converged. Used to pick the best
 * iteration when the loop runs out of attempts.
 */
export function invariantDistance(s: ExtractionInvariantStatus): number {
  let d = 0
  d += Math.abs(s.poolSum - POOL_TARGET) * 1
  // Deck only contributes when out of range; in-range deckSum is fine
  if (s.deckSum < DECK_MIN) d += (DECK_MIN - s.deckSum) * 1
  if (s.deckSum > DECK_MAX) d += (s.deckSum - DECK_MAX) * 1
  d += Math.abs(s.leaderCount - LEADER_TARGET) * 2
  d += Math.abs(s.baseCount - BASE_TARGET) * 2
  d += s.subsetViolations * 5
  return d
}
