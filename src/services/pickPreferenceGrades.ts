/**
 * Pick-preference grading — letter tiers derived from draft pick behavior
 * instead of win rates.
 *
 * Inputs are model strengths fitted offline by scripts/analyze-pick-preferences.ts
 * from reconstructed human pick contests (committed per set under
 * src/data/pickPreferences/):
 *  - Cards: within-aspect Bradley-Terry strength (chosen card vs same-aspect
 *    alternatives visible in the pack).
 *  - Leaders: Plackett-Luce strength over full leader-round choice sets.
 *
 * Grading maps log-strength z-scores onto the existing letter bands
 * (gradeFromZScore), so an A- here means "about 1.5 SD above the set's pick
 * preference", exactly parallel to the win-rate bands it replaces. Win rates
 * remain displayed as metrics; they no longer decide tiers for covered sets.
 *
 * Why the switch: pick data stabilizes in dozens of drafts (thousands of
 * contests per card) while card-level win rates need thousands of games, and
 * the pick model agrees with expert tier lists where small-sample win-rate
 * grades do not. See plans/ASH_ANALYTICS_GAP_ANALYSIS.md.
 */

import {
  CARD_GRADE_MIN_BUCKET_CARDS,
  bucketForScheme,
  gradeFromZScore,
} from './cardDataMetrics'
import type { CardGrade, CardGradeScheme } from './cardDataMetrics'

/** Grade floor: matches the analysis script's default --min-seen. */
export const PICK_GRADE_MIN_SEEN = 20
/** Below this many observations a grade is flagged provisional, not settled. */
export const PICK_GRADE_FULL_SEEN = 50
/** Smallest slice we grade at all (cards). */
export const PICK_GRADE_MIN_CARDS = 25
/** Smallest slice we grade at all (leaders — a set has ~16-18). */
export const PICK_GRADE_MIN_LEADERS = 6

export const PICK_GRADE_BASIS_CARDS = 'Pick Preference'
export const PICK_GRADE_BASIS_LEADERS = 'Leader Pick Preference'
export const PICK_GRADE_POLICY_CARDS = 'pick-preference-bt'
export const PICK_GRADE_POLICY_LEADERS = 'leader-pick-preference-pl'

export interface PickPreferenceCardStat {
  name: string
  subtitle: string
  rarity?: string
  /** 0-100 Bradley-Terry percentile among eligible cards. */
  rating: number | null
  /** Bradley-Terry strength (geometric mean 1 across the set). */
  bt?: number | null
  /** Within-aspect pick rate and its contest count — the grading sample. */
  aRate: number | null
  aSeen: number
  /** Raw pick-rate-when-seen and its contest count. */
  seen?: number
  pickRate?: number | null
  /** Average taken-at (mean pick position when picked). */
  ata?: number | null
}

export interface PickPreferenceLeaderStat {
  name: string
  subtitle: string
  rarity?: string
  /** Plackett-Luce strength (geometric mean 1 across graded leaders). */
  strength: number | null
  seen: number
  picked: number
  pickRate: number | null
  /** Average pick round when taken (leader-draft APR). */
  apr: number | null
}

export interface PickPreferenceSetStats {
  set: string
  generatedAt?: string
  contests?: number
  leaderContests?: number
  humanSeats?: number
  minSeen: number
  cards: PickPreferenceCardStat[]
  leaders?: PickPreferenceLeaderStat[]
}

export type PickGradeStatus = 'graded' | 'sample-too-small' | 'slice-too-small' | 'zero-variance' | 'bucket-too-small'

export interface PickGrade {
  key: string
  grade: CardGrade | null
  zScore: number | null
  status: PickGradeStatus
  provisional: boolean
}

export interface BucketedPickGrade extends PickGrade {
  bucketKey: string | null
  bucketLabel: string | null
}

/** Identity key matching card-data rows: lowercase `name|subtitle`. */
export function pickIdentityKey(name: string | null | undefined, subtitle: string | null | undefined): string {
  return `${String(name || '').trim()}|${String(subtitle || '').trim()}`.toLowerCase()
}

export function pickGradeStatusLabel(status: PickGradeStatus, minSeen: number = PICK_GRADE_MIN_SEEN): string {
  if (status === 'graded') return 'Graded'
  if (status === 'sample-too-small') return `Needs ${minSeen}+ picks seen`
  if (status === 'slice-too-small') return `Needs ${PICK_GRADE_MIN_CARDS} cards`
  if (status === 'bucket-too-small') return 'Too few cards at this cost'
  return 'No spread'
}

interface StrengthInput {
  key: string
  /** Model strength; must be > 0 to grade. */
  strength: number | null | undefined
  /** Observation count backing the strength (contests seen). */
  seen: number
  cost?: number | null
}

/**
 * Grade a population by z-score of log-strength. BT/PL strengths are
 * multiplicative, so log-strength is the natural additive scale; the fitted
 * strengths are normalized to geometric mean 1, putting log-strengths near 0.
 */
function gradeByLogStrength(inputs: StrengthInput[], options: {
  minSeen: number
  minItems: number
}): Map<string, PickGrade> {
  const ungraded = (key: string, status: PickGradeStatus): PickGrade =>
    ({ key, grade: null, zScore: null, status, provisional: false })

  const eligible = inputs.filter(
    (input) => input.seen >= options.minSeen && input.strength != null && input.strength > 0,
  )
  const result = new Map<string, PickGrade>()

  if (eligible.length < options.minItems) {
    for (const input of inputs) result.set(input.key, ungraded(input.key, eligible.some(e => e.key === input.key) ? 'slice-too-small' : 'sample-too-small'))
    return result
  }

  const logs = new Map(eligible.map((input) => [input.key, Math.log(input.strength as number)]))
  const values = Array.from(logs.values())
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
  const sd = Math.sqrt(variance)

  for (const input of inputs) {
    const logStrength = logs.get(input.key)
    if (logStrength == null) {
      result.set(input.key, ungraded(input.key, 'sample-too-small'))
      continue
    }
    if (sd === 0) {
      result.set(input.key, ungraded(input.key, 'zero-variance'))
      continue
    }
    const zScore = (logStrength - mean) / sd
    result.set(input.key, {
      key: input.key,
      grade: gradeFromZScore(zScore),
      zScore,
      status: 'graded',
      provisional: input.seen < PICK_GRADE_FULL_SEEN,
    })
  }
  return result
}

/** Global card grades from within-aspect Bradley-Terry strengths. */
export function computeCardPickGrades(
  cards: PickPreferenceCardStat[],
  options?: { minSeen?: number },
): Map<string, PickGrade> {
  const minSeen = options?.minSeen ?? PICK_GRADE_MIN_SEEN
  return gradeByLogStrength(
    cards.map((card) => ({
      key: pickIdentityKey(card.name, card.subtitle),
      strength: card.bt,
      seen: card.aSeen,
    })),
    { minSeen, minItems: PICK_GRADE_MIN_CARDS },
  )
}

/** Leader grades from Plackett-Luce strengths over leader-round choice sets. */
export function computeLeaderPickGrades(
  leaders: PickPreferenceLeaderStat[],
  options?: { minSeen?: number },
): Map<string, PickGrade> {
  const minSeen = options?.minSeen ?? PICK_GRADE_MIN_SEEN
  return gradeByLogStrength(
    leaders.map((leader) => ({
      key: pickIdentityKey(leader.name, leader.subtitle),
      strength: leader.strength,
      seen: leader.seen,
    })),
    { minSeen, minItems: PICK_GRADE_MIN_LEADERS },
  )
}

/**
 * Bucketed lenses (cost / curve-slot) over the same BT strengths: each card is
 * centred on its own bucket's mean log-strength, with the spread pooled across
 * buckets — mirroring computeBucketedCardGrades so an A- 2-drop and an A-
 * 6-drop are each equally far above par for their slot.
 */
export function computeBucketedCardPickGrades(
  cards: PickPreferenceCardStat[],
  costByKey: Map<string, number | null>,
  scheme: CardGradeScheme,
  options?: { minSeen?: number },
): Map<string, BucketedPickGrade> {
  const minSeen = options?.minSeen ?? PICK_GRADE_MIN_SEEN
  const inputs: StrengthInput[] = cards.map((card) => {
    const key = pickIdentityKey(card.name, card.subtitle)
    return { key, strength: card.bt, seen: card.aSeen, cost: costByKey.get(key) ?? null }
  })

  const buckets = new Map(inputs.map((input) => [input.key, bucketForScheme(scheme, input.cost)]))
  const decorate = (grade: PickGrade): BucketedPickGrade => ({
    ...grade,
    bucketKey: buckets.get(grade.key)?.key ?? null,
    bucketLabel: buckets.get(grade.key)?.label ?? null,
  })
  const result = new Map<string, BucketedPickGrade>()
  const ungraded = (key: string, status: PickGradeStatus) =>
    decorate({ key, grade: null, zScore: null, status, provisional: false })

  const eligible = inputs.filter(
    (input) => input.seen >= minSeen && input.strength != null && input.strength > 0,
  )
  if (eligible.length < PICK_GRADE_MIN_CARDS) {
    for (const input of inputs) result.set(input.key, ungraded(input.key, 'sample-too-small'))
    return result
  }

  const logs = new Map(eligible.map((input) => [input.key, Math.log(input.strength as number)]))
  const grouped = new Map<string, number[]>()
  for (const input of eligible) {
    const bucket = buckets.get(input.key)
    const logStrength = logs.get(input.key)
    if (!bucket || logStrength == null) continue
    const existing = grouped.get(bucket.key)
    if (existing) existing.push(logStrength)
    else grouped.set(bucket.key, [logStrength])
  }

  const bucketMeans = new Map<string, number>()
  let residualSumOfSquares = 0
  let pooledCount = 0
  let pooledBuckets = 0
  for (const [bucketKey, values] of grouped.entries()) {
    if (values.length < CARD_GRADE_MIN_BUCKET_CARDS) continue
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    bucketMeans.set(bucketKey, mean)
    residualSumOfSquares += values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0)
    pooledCount += values.length
    pooledBuckets += 1
  }

  const degreesOfFreedom = pooledCount - pooledBuckets
  const pooledSd = degreesOfFreedom > 0 ? Math.sqrt(residualSumOfSquares / degreesOfFreedom) : 0

  for (const input of inputs) {
    const logStrength = logs.get(input.key)
    if (logStrength == null) {
      result.set(input.key, ungraded(input.key, 'sample-too-small'))
      continue
    }
    const bucket = buckets.get(input.key)
    const bucketMean = bucket ? bucketMeans.get(bucket.key) : undefined
    if (bucketMean == null) {
      result.set(input.key, ungraded(input.key, 'bucket-too-small'))
      continue
    }
    if (pooledSd === 0) {
      result.set(input.key, ungraded(input.key, 'zero-variance'))
      continue
    }
    const zScore = (logStrength - bucketMean) / pooledSd
    result.set(input.key, decorate({
      key: input.key,
      grade: gradeFromZScore(zScore),
      zScore,
      status: 'graded',
      provisional: input.seen < PICK_GRADE_FULL_SEEN,
    }))
  }
  return result
}
