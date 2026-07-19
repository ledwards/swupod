export type CardMetricKey = 'gpWr' | 'ohWr' | 'gdWr' | 'gihWr' | 'gnsWr'

export type CardGrade =
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'
  | 'F'

export interface CardMetricNumerators {
  deckCopies: number
  openerCopies: number
  drawnLaterCopies: number
  tutoredSeenCopies?: number
  playedCopiesFromSeenHand?: number | null
  resourcedCopiesFromSeenHand?: number | null
  win: 0 | 1
}

export interface CardDataMetricRates {
  gpCount: number
  gpWins: number
  gpWr: number | null
  ohCount: number
  ohWins: number
  ohWr: number | null
  gdCount: number
  gdWins: number
  gdWr: number | null
  gihCount: number
  gihWins: number
  gihWr: number | null
  gnsCount: number
  gnsWins: number
  gnsWr: number | null
  iih: number | null
  playedRate: number | null
  resourcedWhenSeen: number | null
}

export interface GradeInput {
  key: string
  wins: number
  denominator: number
}

export type CardGradeStatus =
  | 'graded'
  | 'sample-too-small'
  | 'slice-too-small'
  | 'zero-variance'
  | 'bucket-too-small'

export interface GradeResult {
  key: string
  grade: CardGrade | null
  zScore: number | null
  shrunkRate: number | null
  status: CardGradeStatus
  /** True when graded on a sample below CARD_GRADE_MIN_DENOMINATOR. */
  provisional: boolean
}

export const CARD_GRADE_PRIOR_WEIGHT = 0
export const CARD_GRADE_MIN_DENOMINATOR = 50
export const CARD_GRADE_MIN_CARDS = 25

/**
 * Smallest bucket whose own mean we trust. Below this a bucket is reported as
 * `bucket-too-small` rather than graded against a mean estimated from a handful
 * of cards. The spread is pooled across buckets (see `computeBucketedCardGrades`),
 * so this guards only the per-bucket centre, not the per-bucket variance.
 */
export const CARD_GRADE_MIN_BUCKET_CARDS = 5

/**
 * Floor for a *provisional* grade. Below CARD_GRADE_MIN_DENOMINATOR a win rate
 * is too noisy to grade confidently, but refusing to grade at all would leave
 * the bucketed lenses empty next to a global column that grades on samples as
 * small as one game. Cards between this floor and the full floor are graded and
 * flagged `provisional` so the UI can label them rather than imply confidence.
 */
export const CARD_GRADE_PROVISIONAL_MIN_DENOMINATOR = 10

/**
 * Grading populations.
 *
 * `global` is the historical behaviour: every card in the slice is graded
 * against every other card, which systematically buries cheap cards because
 * win rate rises with cost.
 *
 * `cost` and `curve-slot` grade a card against others competing for the same
 * deck slot. This mirrors the ASH draft guide: "Cards are ranked against other
 * cards of the same cost. S-Tier 2 drops are not necessarily as strong as
 * S-Tier 5 drops." `curve-slot` reproduces the guide's own turn headings, which
 * merge 1- and 2-drops into "Turn 1 Plays".
 */
export const CARD_GRADE_BUCKET_SCHEMES = ['global', 'cost', 'curve-slot'] as const
export type CardGradeScheme = (typeof CARD_GRADE_BUCKET_SCHEMES)[number]

export interface CardGradeBucket {
  key: string
  label: string
}

export interface BucketedGradeInput extends GradeInput {
  cost: number | null
}

export interface BucketedGradeResult extends GradeResult {
  bucketKey: string | null
  bucketLabel: string | null
}

const CURVE_SLOT_BUCKETS: CardGradeBucket[] = [
  { key: 'turn-1', label: 'Turn 1 Plays (1-2)' },
  { key: 'turn-2', label: 'Turn 2 Plays (3)' },
  { key: 'turn-3', label: 'Turn 3 Plays (4)' },
  { key: 'turn-4', label: 'Turn 4 Plays (5)' },
  { key: 'turn-5', label: 'Turn 5 Plays (6)' },
  { key: 'turn-6', label: 'Turn 6 Plays (7+)' },
]

export function bucketForScheme(scheme: CardGradeScheme, cost: number | null | undefined): CardGradeBucket | null {
  if (scheme === 'global') return null
  if (cost == null || !Number.isFinite(cost)) return null

  const capped = Math.max(0, Math.min(Math.floor(cost), 7))

  if (scheme === 'cost') {
    return capped >= 7
      ? { key: '7+', label: '7+ Drop' }
      : { key: String(capped), label: `${capped}-Drop` }
  }

  // curve-slot: 0-2 share Turn 1, then one bucket per turn through 7+.
  const index = capped <= 2 ? 0 : capped - 2
  return CURVE_SLOT_BUCKETS[index] ?? null
}

/**
 * Grade cards against their own cost bucket instead of the whole set.
 *
 * The spread is a *pooled* within-bucket standard deviation: each card is
 * centred on its own bucket's mean, but the divisor is estimated from the
 * residuals of every bucket at once. That is what lets a 20-card bucket grade
 * at all — it borrows the shared spread rather than estimating its own from too
 * few points — and it keeps grades comparable across buckets, so an A- 2-drop
 * and an A- 6-drop are each equally far above par for their slot.
 */
export function computeBucketedCardGrades(
  inputs: BucketedGradeInput[],
  scheme: CardGradeScheme,
  options?: {
    minDenominator?: number
    minCards?: number
    minBucketCards?: number
    priorWeight?: number
    sliceMean?: number
  },
): BucketedGradeResult[] {
  if (scheme === 'global') {
    return computeCardGrades(inputs, options).map((grade) => ({
      ...grade,
      bucketKey: null,
      bucketLabel: null,
    }))
  }

  const minDenominator = options?.minDenominator ?? CARD_GRADE_MIN_DENOMINATOR
  const minCards = options?.minCards ?? CARD_GRADE_MIN_CARDS
  const minBucketCards = options?.minBucketCards ?? CARD_GRADE_MIN_BUCKET_CARDS
  const priorWeight = options?.priorWeight ?? CARD_GRADE_PRIOR_WEIGHT
  // Anything graded below the full floor is flagged rather than presented as settled.
  const isProvisional = (denominator: number) => denominator < CARD_GRADE_MIN_DENOMINATOR

  const buckets = new Map(inputs.map((input) => [input.key, bucketForScheme(scheme, input.cost)]))
  const decorate = (grade: GradeResult): BucketedGradeResult => ({
    ...grade,
    bucketKey: buckets.get(grade.key)?.key ?? null,
    bucketLabel: buckets.get(grade.key)?.label ?? null,
  })
  const ungraded = (key: string, status: CardGradeStatus, shrunkRate: number | null = null) =>
    decorate({ key, grade: null, zScore: null, shrunkRate, status, provisional: false })

  const totalWins = inputs.reduce((sum, input) => sum + input.wins, 0)
  const totalDenominator = inputs.reduce((sum, input) => sum + input.denominator, 0)
  const sliceMean = options?.sliceMean ?? (totalDenominator > 0 ? totalWins / totalDenominator : 0.5)
  const gradeable = inputs.filter((input) => input.denominator >= minDenominator)

  if (gradeable.length < minCards) {
    return inputs.map((input) => ungraded(
      input.key,
      input.denominator >= minDenominator ? 'slice-too-small' : 'sample-too-small',
    ))
  }

  // Shrink toward the slice mean, matching the global path. Inert while
  // CARD_GRADE_PRIOR_WEIGHT is 0; centring on the bucket mean happens below.
  const shrunk = new Map<string, number>()
  for (const input of gradeable) {
    shrunk.set(input.key, (input.wins + sliceMean * priorWeight) / (input.denominator + priorWeight))
  }

  const grouped = new Map<string, number[]>()
  for (const input of gradeable) {
    const bucket = buckets.get(input.key)
    if (!bucket) continue
    const rate = shrunk.get(input.key)
    if (rate == null) continue
    const existing = grouped.get(bucket.key)
    if (existing) existing.push(rate)
    else grouped.set(bucket.key, [rate])
  }

  const bucketMeans = new Map<string, number>()
  let residualSumOfSquares = 0
  let pooledCount = 0
  let pooledBuckets = 0
  for (const [bucketKey, rates] of grouped.entries()) {
    if (rates.length < minBucketCards) continue
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    bucketMeans.set(bucketKey, mean)
    residualSumOfSquares += rates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0)
    pooledCount += rates.length
    pooledBuckets += 1
  }

  // One degree of freedom is spent per bucket mean we estimated.
  const degreesOfFreedom = pooledCount - pooledBuckets
  const pooledSd = degreesOfFreedom > 0 ? Math.sqrt(residualSumOfSquares / degreesOfFreedom) : 0

  return inputs.map((input) => {
    const shrunkRate = shrunk.get(input.key) ?? null
    if (shrunkRate == null) return ungraded(input.key, 'sample-too-small')

    const bucket = buckets.get(input.key)
    const bucketMean = bucket ? bucketMeans.get(bucket.key) : undefined
    if (bucketMean == null) return ungraded(input.key, 'bucket-too-small', shrunkRate)
    if (pooledSd === 0) return ungraded(input.key, 'zero-variance', shrunkRate)

    const zScore = (shrunkRate - bucketMean) / pooledSd
    return decorate({
      key: input.key,
      grade: gradeFromZScore(zScore),
      zScore,
      shrunkRate,
      status: 'graded',
      provisional: isProvisional(input.denominator),
    })
  })
}

export function computeGnsCopies(input: {
  deckCopies: number
  openerCopies: number
  drawnLaterCopies: number
  tutoredSeenCopies?: number | undefined
}): number {
  const seenForGns = Math.min(
    input.deckCopies,
    input.openerCopies + input.drawnLaterCopies + (input.tutoredSeenCopies || 0),
  )
  return Math.max(input.deckCopies - seenForGns, 0)
}

function wr(wins: number, denominator: number): number | null {
  return denominator > 0 ? wins / denominator : null
}

function pp(a: number | null, b: number | null, minA: number, minB: number, denomA: number, denomB: number): number | null {
  if (a == null || b == null || denomA < minA || denomB < minB) return null
  return (a - b) * 100
}

export function computeCardMetricRates(facts: CardMetricNumerators[], options?: { iihMinDenominator?: number }): CardDataMetricRates {
  const minIih = options?.iihMinDenominator ?? CARD_GRADE_MIN_DENOMINATOR
  let gpCount = 0
  let gpWins = 0
  let ohCount = 0
  let ohWins = 0
  let gdCount = 0
  let gdWins = 0
  let gihCount = 0
  let gihWins = 0
  let gnsCount = 0
  let gnsWins = 0
  let playedCopies = 0
  let playedAvailable = true
  let resourcedCopies = 0
  let resourcedAvailable = true

  for (const fact of facts) {
    const win = fact.win
    const deckCopies = Math.max(0, fact.deckCopies || 0)
    const openerCopies = Math.max(0, fact.openerCopies || 0)
    const drawnLaterCopies = Math.max(0, fact.drawnLaterCopies || 0)
    const gihCopies = openerCopies + drawnLaterCopies
    const gnsCopies = computeGnsCopies({
      deckCopies,
      openerCopies,
      drawnLaterCopies,
      tutoredSeenCopies: fact.tutoredSeenCopies,
    })

    gpCount += deckCopies
    gpWins += deckCopies * win
    ohCount += openerCopies
    ohWins += openerCopies * win
    gdCount += drawnLaterCopies
    gdWins += drawnLaterCopies * win
    gihCount += gihCopies
    gihWins += gihCopies * win
    gnsCount += gnsCopies
    gnsWins += gnsCopies * win

    if (fact.playedCopiesFromSeenHand == null) playedAvailable = false
    else playedCopies += Math.max(0, fact.playedCopiesFromSeenHand)

    if (fact.resourcedCopiesFromSeenHand == null) resourcedAvailable = false
    else resourcedCopies += Math.max(0, fact.resourcedCopiesFromSeenHand)
  }

  const gpRate = wr(gpWins, gpCount)
  const ohRate = wr(ohWins, ohCount)
  const gdRate = wr(gdWins, gdCount)
  const gihRate = wr(gihWins, gihCount)
  const gnsRate = wr(gnsWins, gnsCount)

  return {
    gpCount,
    gpWins,
    gpWr: gpRate,
    ohCount,
    ohWins,
    ohWr: ohRate,
    gdCount,
    gdWins,
    gdWr: gdRate,
    gihCount,
    gihWins,
    gihWr: gihRate,
    gnsCount,
    gnsWins,
    gnsWr: gnsRate,
    iih: pp(gihRate, gnsRate, minIih, minIih, gihCount, gnsCount),
    playedRate: playedAvailable && gihCount > 0 ? playedCopies / gihCount : null,
    resourcedWhenSeen: resourcedAvailable && gihCount > 0 ? resourcedCopies / gihCount : null,
  }
}

export function gradeFromZScore(zScore: number): CardGrade {
  if (zScore >= 2.145) return 'A+'
  if (zScore >= 1.815) return 'A'
  if (zScore >= 1.485) return 'A-'
  if (zScore >= 1.155) return 'B+'
  if (zScore >= 0.825) return 'B'
  if (zScore >= 0.495) return 'B-'
  if (zScore >= 0.165) return 'C+'
  if (zScore >= -0.165) return 'C'
  if (zScore >= -0.495) return 'C-'
  if (zScore >= -0.825) return 'D+'
  if (zScore >= -1.155) return 'D'
  if (zScore >= -1.485) return 'D-'
  return 'F'
}

export function computeCardGrades(inputs: GradeInput[], options?: {
  minDenominator?: number
  minCards?: number
  priorWeight?: number
  sliceMean?: number
}): GradeResult[] {
  const minDenominator = options?.minDenominator ?? CARD_GRADE_MIN_DENOMINATOR
  const minCards = options?.minCards ?? CARD_GRADE_MIN_CARDS
  const priorWeight = options?.priorWeight ?? CARD_GRADE_PRIOR_WEIGHT
  const totalWins = inputs.reduce((sum, input) => sum + input.wins, 0)
  const totalDenominator = inputs.reduce((sum, input) => sum + input.denominator, 0)
  const sliceMean = options?.sliceMean ?? (totalDenominator > 0 ? totalWins / totalDenominator : 0.5)
  const gradeable = inputs.filter((input) => input.denominator >= minDenominator)

  if (gradeable.length < minCards) {
    return inputs.map((input) => ({
      key: input.key,
      grade: null,
      zScore: null,
      shrunkRate: null,
      status: input.denominator >= minDenominator ? 'slice-too-small' : 'sample-too-small',
      provisional: false,
    }))
  }

  const shrunk = new Map<string, number>()
  for (const input of gradeable) {
    shrunk.set(input.key, (input.wins + sliceMean * priorWeight) / (input.denominator + priorWeight))
  }

  const values = Array.from(shrunk.values())
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
  const sd = Math.sqrt(variance)

  if (sd === 0) {
    return inputs.map((input) => ({
      key: input.key,
      grade: null,
      zScore: null,
      shrunkRate: shrunk.get(input.key) ?? null,
      status: input.denominator >= minDenominator ? 'zero-variance' : 'sample-too-small',
      provisional: false,
    }))
  }

  return inputs.map((input) => {
    const shrunkRate = shrunk.get(input.key)
    if (shrunkRate == null) {
      return {
        key: input.key,
        grade: null,
        zScore: null,
        shrunkRate: null,
        status: 'sample-too-small',
        provisional: false,
      }
    }

    const zScore = (shrunkRate - mean) / sd
    return {
      key: input.key,
      grade: gradeFromZScore(zScore),
      zScore,
      shrunkRate,
      status: 'graded',
      provisional: false,
    }
  })
}
