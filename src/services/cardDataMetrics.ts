export type CardMetricKey = 'gpWr' | 'ohWr' | 'gdWr' | 'gihWr' | 'gnsWr'

export type SeventeenLandsRateMetricKey = CardMetricKey | 'playedRate' | 'resourcedWhenSeen'
export type SeventeenLandsDeltaMetricKey = 'iih' | 'playedWar'
export type SeventeenLandsDisplayMetricKey =
  | 'grade'
  | SeventeenLandsRateMetricKey
  | SeventeenLandsDeltaMetricKey

export interface SeventeenLandsMetricDefinition {
  key: SeventeenLandsDisplayMetricKey
  column: string
  label: string
  formula: string
  kind: 'grade' | 'rate' | 'delta'
}

export interface SeventeenLandsFormattedMetric {
  key: SeventeenLandsDisplayMetricKey
  label: string
  value: string
  display: string
  formula: string
  numerator?: number
  denominator?: number
  percentage?: number | null
}

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

export interface GradeResult {
  key: string
  grade: CardGrade | null
  zScore: number | null
  shrunkRate: number | null
  status: 'graded' | 'sample-too-small' | 'slice-too-small' | 'zero-variance'
}

export const CARD_GRADE_PRIOR_WEIGHT = 50
export const CARD_GRADE_MIN_DENOMINATOR = 50
export const CARD_GRADE_MIN_CARDS = 25

export const SEVENTEEN_LANDS_TABLE_COLUMNS = [
  'Title',
  'Aspects',
  'C',
  'R',
  'G',
  'GP WR',
  'OH WR',
  'GD WR',
  'GIH WR',
  'GNS WR',
  'IIH',
  'PR',
  'RWS%',
  'PWAR',
] as const

export const SEVENTEEN_LANDS_METRICS: Record<SeventeenLandsDisplayMetricKey, SeventeenLandsMetricDefinition> = {
  grade: {
    key: 'grade',
    column: 'G',
    label: 'G',
    formula: 'derived grade from selected basis, default GIH WR, fallback GP WR',
    kind: 'grade',
  },
  gpWr: {
    key: 'gpWr',
    column: 'GP WR',
    label: 'GP WR',
    formula: 'gp_wins / gp_count',
    kind: 'rate',
  },
  ohWr: {
    key: 'ohWr',
    column: 'OH WR',
    label: 'OH WR',
    formula: 'oh_wins / oh_count',
    kind: 'rate',
  },
  gdWr: {
    key: 'gdWr',
    column: 'GD WR',
    label: 'GD WR',
    formula: 'gd_wins / gd_count',
    kind: 'rate',
  },
  gihWr: {
    key: 'gihWr',
    column: 'GIH WR',
    label: 'GIH WR',
    formula: 'gih_wins / gih_count',
    kind: 'rate',
  },
  gnsWr: {
    key: 'gnsWr',
    column: 'GNS WR',
    label: 'GNS WR',
    formula: 'gns_wins / gns_count',
    kind: 'rate',
  },
  iih: {
    key: 'iih',
    column: 'IIH',
    label: 'IIH',
    formula: '(gih_wins / gih_count) - (gns_wins / gns_count)',
    kind: 'delta',
  },
  playedRate: {
    key: 'playedRate',
    column: 'PR',
    label: 'PR',
    formula: 'played_copies_from_seen_hand / gih_count',
    kind: 'rate',
  },
  resourcedWhenSeen: {
    key: 'resourcedWhenSeen',
    column: 'RWS%',
    label: 'RWS%',
    formula: 'resourced_copies_from_seen_hand / gih_count',
    kind: 'rate',
  },
  playedWar: {
    key: 'playedWar',
    column: 'PWAR',
    label: 'PWAR',
    formula: '(played_wins / played_count) - (unplayed_wins / unplayed_count)',
    kind: 'delta',
  },
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

function cleanDisplayCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function formatPercentage(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`
}

export function formatSeventeenLandsRateMetric(
  key: SeventeenLandsRateMetricKey,
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): SeventeenLandsFormattedMetric {
  const definition = SEVENTEEN_LANDS_METRICS[key]
  const cleanNumerator = cleanDisplayCount(numerator ?? 0)
  const cleanDenominator = cleanDisplayCount(denominator ?? 0)

  if (cleanDenominator <= 0) {
    return {
      key,
      label: definition.label,
      value: '--',
      display: `${definition.label} --`,
      formula: definition.formula,
      numerator: cleanNumerator,
      denominator: cleanDenominator,
      percentage: null,
    }
  }

  const percentage = cleanNumerator / cleanDenominator
  const value = `${formatPercentage(percentage)} (${cleanNumerator}/${cleanDenominator})`

  return {
    key,
    label: definition.label,
    value,
    display: `${definition.label} ${value}`,
    formula: definition.formula,
    numerator: cleanNumerator,
    denominator: cleanDenominator,
    percentage,
  }
}

export function formatSeventeenLandsDeltaMetric(
  key: SeventeenLandsDeltaMetricKey,
  percentagePoints: number | null | undefined,
): SeventeenLandsFormattedMetric {
  const definition = SEVENTEEN_LANDS_METRICS[key]
  if (percentagePoints == null || !Number.isFinite(percentagePoints)) {
    return {
      key,
      label: definition.label,
      value: '--',
      display: `${definition.label} --`,
      formula: definition.formula,
      percentage: null,
    }
  }

  const rounded = Math.round(percentagePoints * 10) / 10
  const value = `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}pp`
  return {
    key,
    label: definition.label,
    value,
    display: `${definition.label} ${value}`,
    formula: definition.formula,
    percentage: rounded,
  }
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
      grade: input.denominator >= minDenominator ? 'C' : null,
      zScore: input.denominator >= minDenominator ? 0 : null,
      shrunkRate: shrunk.get(input.key) ?? null,
      status: input.denominator >= minDenominator ? 'graded' : 'sample-too-small',
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
      }
    }

    const zScore = (shrunkRate - mean) / sd
    return {
      key: input.key,
      grade: gradeFromZScore(zScore),
      zScore,
      shrunkRate,
      status: 'graded',
    }
  })
}

export function computeStrictOrProvisionalGrades(inputs: GradeInput[]): {
  grades: Map<string, GradeResult>
  provisional: boolean
} {
  const strict = computeCardGrades(inputs)
  const provisional = computeCardGrades(inputs, {
    minDenominator: 1,
    minCards: 5,
  })
  const provisionalByKey = new Map(provisional.map((grade) => [grade.key, grade]))
  let usedProvisional = false
  const merged = strict.map((grade) => {
    if (grade.grade != null) return grade
    const fallback = provisionalByKey.get(grade.key)
    if (fallback?.grade != null) {
      usedProvisional = true
      return fallback
    }
    return grade
  })

  return {
    grades: new Map(merged.map((grade) => [grade.key, grade])),
    provisional: usedProvisional,
  }
}
