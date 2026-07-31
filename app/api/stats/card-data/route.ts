// GET /api/stats/card-data - 17Lands-style card data, currently backed by decklist + match-result facts.
import { queryRows } from '@/lib/db'
import { requireFullStatsAccess } from '@/lib/auth'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import type { RawCard } from '@/src/utils/cardData'
import { buildCardLookupMaps, cardIdentityKey } from '@/src/utils/cardNormalization'
import {
  CARD_GRADE_BUCKET_SCHEMES,
  CARD_GRADE_PROVISIONAL_MIN_DENOMINATOR,
  computeBucketedCardGrades,
  computeCardGrades,
} from '@/src/services/cardDataMetrics'
import {
  PICK_GRADE_BASIS_CARDS,
  PICK_GRADE_BASIS_LEADERS,
  PICK_GRADE_POLICY_CARDS,
  PICK_GRADE_POLICY_LEADERS,
  computeBucketedCardPickGrades,
  computeCardPickGrades,
  computeLeaderPickGrades,
  pickGradeStatusLabel,
  pickIdentityKey,
} from '@/src/services/pickPreferenceGrades'
import type { PickGrade, PickPreferenceSetStats } from '@/src/services/pickPreferenceGrades'
import { pickPreferenceStatsForSet } from '@/src/data/pickPreferences'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
import { NextRequest } from 'next/server'

const GRADE_SORT: Record<string, number> = {
  'A+': 12,
  A: 11,
  'A-': 10,
  'B+': 9,
  B: 8,
  'B-': 7,
  'C+': 6,
  C: 5,
  'C-': 4,
  'D+': 3,
  D: 2,
  'D-': 1,
  F: 0,
}

type WayfinderCardStatsRow = {
  slug?: string
  cardUuid?: string | null
  name?: string | null
  subtitle?: string | null
  type?: string | null
  aspects?: unknown
  cost?: number | null
  setCode?: string | null
  collectorNumber?: string | null
  rarity?: string | null
  imageUrl?: string | null
  backImageUrl?: string | null
  hyperspaceImageUrl?: string | null
  hyperspaceBackImageUrl?: string | null
  deckCount?: number | null
  totalDecks?: number | null
  deckGames?: number | null
  gpWins?: number | null
  gpWr?: number | null
  ohGames?: number | null
  ohWr?: number | null
  gdGames?: number | null
  gdWr?: number | null
  gihGames?: number | null
  gihWr?: number | null
  gnsGames?: number | null
  gnsWr?: number | null
  iih?: number | null
  playedRate?: number | null
  resourcedWhenSeenRate?: number | null
  playedWar?: number | null
  grade?: string | null
  gradeMetricLabel?: string | null
  gradeBasis?: string | null
  handMetricsStatus?: string | null
  sampleWarning?: string | null
}

function pct(wins: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((wins / denominator) * 1000) / 10
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveCard(cardMap: Map<string, any>, entry: any) {
  const id = entry?.id || entry?.cardId || entry?.card_id
  if (!id) return null
  return cardMap.get(id) || cardMap.get(String(id).replace(/-/g, '_')) || null
}

function fallbackStoredCard(entry: any, type: 'Leader' | 'Base' | 'Unit') {
  const name = entry?.name || entry?.cardName
  if (!name) return null
  return {
    id: entry?.id || entry?.cardId || entry?.card_id || `${type}:${name}:${entry?.subtitle || ''}`,
    cardId: entry?.cardId || entry?.card_id || null,
    name,
    subtitle: entry?.subtitle || null,
    rarity: entry?.rarity || (type === 'Base' ? 'Common' : 'Unknown'),
    type: entry?.type || type,
    aspects: Array.isArray(entry?.aspects) ? entry.aspects : [],
    cost: entry?.cost ?? null,
    imageUrl: entry?.imageUrl || entry?.image_url || null,
    backImageUrl: entry?.backImageUrl || entry?.back_image_url || null,
    isLeader: type === 'Leader',
    isBase: type === 'Base',
  }
}

function entryCopies(entry: any): number {
  return Math.max(0, Math.floor(num(entry?.count, 1)))
}

function gradeStatusLabel(status: string): string {
  if (status === 'graded') return 'Graded'
  if (status === 'provisional') return 'Provisional'
  if (status === 'sample-too-small') return 'Needs 50+ GP'
  if (status === 'slice-too-small') return 'Needs 25 cards'
  if (status === 'zero-variance') return 'No spread'
  if (status === 'bucket-too-small') return 'Too few cards at this cost'
  return status
}

function leaderGradeFromWinRate(value: number | null | undefined, count: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || (count || 0) <= 0) return null
  if (value >= 70) return 'A+'
  if (value >= 65) return 'A'
  if (value >= 60) return 'A-'
  if (value >= 57.5) return 'B+'
  if (value >= 55) return 'B'
  if (value >= 52.5) return 'B-'
  if (value >= 50) return 'C+'
  if (value >= 47.5) return 'C'
  if (value >= 45) return 'C-'
  if (value >= 42.5) return 'D+'
  if (value >= 40) return 'D'
  if (value >= 35) return 'D-'
  return 'F'
}

function rateToPct(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 1000) / 10
}

function winsFromRate(rate: unknown, denominator: unknown): number | null {
  const parsedRate = Number(rate)
  const parsedDenominator = Number(denominator)
  if (!Number.isFinite(parsedRate) || !Number.isFinite(parsedDenominator)) return null
  return Math.round(parsedRate * parsedDenominator * 10) / 10
}

function wayfinderEraForSet(setCode: string): string | null {
  if (!setCode || setCode === 'all') return null
  return setCode === 'ASH' ? 'ASH-pre-release' : setCode
}

function wayfinderStatsUrl(setCode: string): string | null {
  const era = wayfinderEraForSet(setCode)
  if (!era) return null

  const base = process.env.WAYFINDER_CARD_STATS_BASE_URL || 'https://plugin.wayfinder.news'
  const url = new URL('/api/cards/stats', base)
  url.searchParams.set('era', era)
  url.searchParams.set('format', 'limited')
  url.searchParams.set('sources', 'karabast,ptp')
  url.searchParams.set('limit', 'all')
  url.searchParams.set('excludeMirrors', 'true')
  return url.toString()
}

function mapWayfinderRow(row: WayfinderCardStatsRow) {
  const cardType = row.type || 'Unknown'
  const isLeader = cardType.toLowerCase().includes('leader')
  const isBase = cardType.toLowerCase().includes('base')
  const gpCount = num(row.deckGames)
  const ohCount = row.ohGames == null ? null : num(row.ohGames)
  const gdCount = row.gdGames == null ? null : num(row.gdGames)
  const gihCount = row.gihGames == null ? null : num(row.gihGames)
  const gnsCount = row.gnsGames == null ? null : num(row.gnsGames)
  const sampleWarning = row.sampleWarning || null
  const gpWr = rateToPct(row.gpWr)
  const grade = isLeader ? leaderGradeFromWinRate(gpWr, gpCount) : row.grade || null
  const gradeStatus = grade
    ? sampleWarning && /provisional/i.test(sampleWarning) ? 'provisional' : 'graded'
    : 'sample-too-small'
  const gradePolicy = isLeader
    ? 'leader-win-rate'
    : grade
      ? gradeStatus === 'provisional' ? 'wayfinder-provisional' : 'wayfinder'
      : 'ungraded'

  return {
    cardName: row.name || row.slug || 'Unknown Card',
    cardId: row.cardUuid || row.slug || null,
    subtitle: row.subtitle || null,
    rarity: row.rarity || 'Unknown',
    cardType,
    aspects: Array.isArray(row.aspects) ? row.aspects.filter((aspect): aspect is string => typeof aspect === 'string') : [],
    cost: row.cost ?? null,
    imageUrl: row.imageUrl || null,
    backImageUrl: row.backImageUrl || null,
    hyperspaceImageUrl: row.hyperspaceImageUrl || null,
    hyperspaceBackImageUrl: row.hyperspaceBackImageUrl || null,
    collectorNumber: row.collectorNumber || null,
    setCode: row.setCode || null,
    isLeader,
    isBase,
    grade,
    displayGrade: grade,
    gradeBasis: isLeader ? 'Leader WR' : row.gradeMetricLabel || 'GIH WR',
    gradeStatus,
    gradeStatusLabel: gradeStatusLabel(gradeStatus),
    gradePolicy,
    deckCount: num(row.deckCount),
    rawCopies: gpCount,
    gpCount,
    gpWins: num(row.gpWins),
    gpWr,
    ohCount: isLeader ? null : ohCount,
    ohWins: isLeader ? null : winsFromRate(row.ohWr, row.ohGames),
    ohWr: isLeader ? null : rateToPct(row.ohWr),
    gdCount: isLeader ? null : gdCount,
    gdWins: isLeader ? null : winsFromRate(row.gdWr, row.gdGames),
    gdWr: isLeader ? null : rateToPct(row.gdWr),
    gihCount: isLeader ? null : gihCount,
    gihWins: isLeader ? null : winsFromRate(row.gihWr, row.gihGames),
    gihWr: isLeader ? null : rateToPct(row.gihWr),
    gnsCount: isLeader ? null : gnsCount,
    gnsWins: isLeader ? null : winsFromRate(row.gnsWr, row.gnsGames),
    gnsWr: isLeader ? null : rateToPct(row.gnsWr),
    iih: isLeader ? null : rateToPct(row.iih),
    playedRate: isLeader ? null : rateToPct(row.playedRate),
    resourcedWhenSeen: isLeader ? null : rateToPct(row.resourcedWhenSeenRate),
    playedWar: isLeader ? null : rateToPct(row.playedWar),
    sampleWarning,
  }
}

export function mapWayfinderRowsToCardDataStats({
  rows,
  setCode,
  format,
}: {
  rows: WayfinderCardStatsRow[]
  setCode: string
  format: string
}) {
  const cards = rows.map(mapWayfinderRow)
  const totalDecks = rows.reduce((max, row) => Math.max(max, num(row.totalDecks)), 0)
  const totalMatches = cards.reduce((sum, card) => sum + card.gpCount, 0)
  const gradeBasis = cards.find((card) => card.gradeBasis)?.gradeBasis || 'GIH WR'
  const hasReplayMetrics = cards.some((card) => (card.gihCount || 0) > 0 || (card.ohCount || 0) > 0 || (card.gdCount || 0) > 0)

  return {
    setCode,
    format: format === 'all' ? 'limited' : format,
    source: 'online',
    sourceDetail: 'wayfinder',
    totalDecks,
    totalMatches,
    onlineLinkedDecks: totalDecks,
    replayMetricsStatus: hasReplayMetrics ? 'available' : 'unvalidated',
    gradeBasis,
    leaders: [],
    bases: [],
    cards,
  }
}

export function shouldPreferWayfinderCardData({
  format,
  source,
  tournamentOnly,
  topPlayersOnly,
  userId,
}: {
  format: string
  source: string
  tournamentOnly: boolean
  topPlayersOnly: boolean
  userId: string | null
}) {
  return format === 'limited' &&
    source === 'online' &&
    !tournamentOnly &&
    !topPlayersOnly &&
    !userId
}

function cardDataRowStrictKey(row: any): string {
  return `${row.cardName || ''}|${row.subtitle || ''}|${row.cardType || ''}`.toLowerCase()
}

function cardDataRowLooseKey(row: any): string {
  return `${row.cardName || ''}|${row.subtitle || ''}`.toLowerCase()
}

type HyperspaceImages = {
  hyperspaceImageUrl: string | null
  hyperspaceBackImageUrl: string | null
}

type HyperspaceImageLookup = {
  bySetIdentity: Map<string, HyperspaceImages>
  byIdentity: Map<string, HyperspaceImages>
}

function hyperspaceKeyPart(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function hyperspaceIdentityKey(name: unknown, type: unknown, subtitle: unknown): string | null {
  const cardName = hyperspaceKeyPart(name)
  if (!cardName) return null
  return `${cardName}|${hyperspaceKeyPart(type)}|${hyperspaceKeyPart(subtitle)}`
}

function hyperspaceSetIdentityKey(setCode: unknown, identityKey: string | null): string | null {
  const set = hyperspaceKeyPart(setCode)
  if (!set || !identityKey) return null
  return `${set}|${identityKey}`
}

function isHyperspaceCard(card: RawCard): boolean {
  return Boolean(card.isHyperspace || card.variantType?.includes('Hyperspace'))
}

function hyperspacePreference(card: RawCard): number {
  if (card.variantType === 'Hyperspace') return 2
  if (card.variantType === 'Hyperspace Foil') return 1
  return 0
}

function buildHyperspaceImageLookup(cards: RawCard[]): HyperspaceImageLookup {
  const bySetIdentity = new Map<string, HyperspaceImages>()
  const byIdentity = new Map<string, HyperspaceImages>()
  const hyperspaceCards = cards
    .filter(card => isHyperspaceCard(card) && (card.imageUrl || card.backImageUrl))
    .sort((a, b) => hyperspacePreference(b) - hyperspacePreference(a))

  for (const card of hyperspaceCards) {
    const identityKey = hyperspaceIdentityKey(card.name, card.type, card.subtitle)
    if (!identityKey) continue

    const images = {
      hyperspaceImageUrl: card.imageUrl || null,
      hyperspaceBackImageUrl: card.backImageUrl || null,
    }
    const setIdentityKey = hyperspaceSetIdentityKey(card.set, identityKey)
    if (setIdentityKey && !bySetIdentity.has(setIdentityKey)) {
      bySetIdentity.set(setIdentityKey, images)
    }
    if (!byIdentity.has(identityKey)) {
      byIdentity.set(identityKey, images)
    }
  }

  return { bySetIdentity, byIdentity }
}

function hyperspaceImagesForRow(row: any, lookup: HyperspaceImageLookup): HyperspaceImages | null {
  const identityKey = hyperspaceIdentityKey(row.cardName || row.name, row.cardType || row.type, row.subtitle)
  if (!identityKey) return null

  const setIdentityKey = hyperspaceSetIdentityKey(row.setCode || row.set, identityKey)
  return (setIdentityKey ? lookup.bySetIdentity.get(setIdentityKey) : null) || lookup.byIdentity.get(identityKey) || null
}

function enrichRowsWithHyperspaceImages<T extends Record<string, any>>(rows: T[] | undefined, lookup: HyperspaceImageLookup): T[] {
  return (rows || []).map(row => {
    const images = hyperspaceImagesForRow(row, lookup)
    return {
      ...row,
      hyperspaceImageUrl: row.hyperspaceImageUrl || images?.hyperspaceImageUrl || null,
      hyperspaceBackImageUrl: row.hyperspaceBackImageUrl || images?.hyperspaceBackImageUrl || null,
    }
  })
}

export function enrichPayloadWithHyperspaceImages<T extends { leaders?: any[]; bases?: any[]; cards?: any[] }>(
  payload: T,
  allCards: RawCard[],
): T {
  const lookup = buildHyperspaceImageLookup(allCards)
  return {
    ...payload,
    leaders: enrichRowsWithHyperspaceImages(payload.leaders, lookup),
    bases: enrichRowsWithHyperspaceImages(payload.bases, lookup),
    cards: enrichRowsWithHyperspaceImages(payload.cards, lookup),
  }
}

const WAYFINDER_REPLAY_FIELDS = [
  'collectorNumber',
  'setCode',
  'ohCount',
  'ohWins',
  'ohWr',
  'gdCount',
  'gdWins',
  'gdWr',
  'gihCount',
  'gihWins',
  'gihWr',
  'gnsCount',
  'gnsWins',
  'gnsWr',
  'iih',
  'playedRate',
  'resourcedWhenSeen',
  'playedWar',
]

const WAYFINDER_GRADE_FIELDS = [
  'grade',
  'displayGrade',
  'gradeBasis',
  'gradeStatus',
  'gradeStatusLabel',
  'gradePolicy',
  'sampleWarning',
]

function mergeWayfinderReplayRows<T extends Record<string, any>>(rows: T[], wayfinderRows: any[]): T[] {
  const byStrictKey = new Map(wayfinderRows.map(row => [cardDataRowStrictKey(row), row]))
  const byLooseKey = new Map(wayfinderRows.map(row => [cardDataRowLooseKey(row), row]))

  return rows.map(row => {
    const wayfinderRow = byStrictKey.get(cardDataRowStrictKey(row)) || byLooseKey.get(cardDataRowLooseKey(row))
    if (!wayfinderRow) return row

    const merged: any = { ...row }
    if (merged.isLeader || String(merged.cardType || '').toLowerCase().includes('leader')) return merged
    for (const field of WAYFINDER_REPLAY_FIELDS) {
      if (wayfinderRow[field] != null) merged[field] = wayfinderRow[field]
    }
    for (const field of WAYFINDER_GRADE_FIELDS) {
      if (field in wayfinderRow) merged[field] = wayfinderRow[field]
    }
    return merged
  })
}

/**
 * Add per-cost-bucket grades alongside the existing global grade.
 *
 * The global `displayGrade` is left exactly as-is — it may come from Wayfinder
 * (default limited view) or from the local GP path — so nothing regresses. The
 * bucketed grades are always computed here, by PTP, from the raw counts on the
 * row, which keeps a single grading method across both data sources.
 *
 * One metric basis is chosen for the whole slice: z-scores are only comparable
 * within a common denominator, so a slice cannot mix GIH-graded and GP-graded
 * cards. Leaders and bases are excluded — they have no cost and are graded by
 * absolute win rate elsewhere.
 */
export function withBucketedCardGrades<T extends { cards?: any[] }>(payload: T): T {
  const cards = payload?.cards || []
  if (cards.length === 0) return payload

  const gradableRows = cards.filter((card) => !card?.isLeader && !card?.isBase)
  const useGih = gradableRows.some((card) => num(card.gihCount) > 0 && card.gihWins != null)

  const inputs = gradableRows.map((card) => ({
    key: cardDataRowStrictKey(card),
    cost: card.cost ?? null,
    wins: useGih ? num(card.gihWins) : num(card.gpWins),
    denominator: useGih ? num(card.gihCount) : num(card.gpCount),
  }))

  const bySchemeByKey = new Map<string, Map<string, any>>()
  for (const scheme of CARD_GRADE_BUCKET_SCHEMES) {
    if (scheme === 'global') continue
    bySchemeByKey.set(
      scheme,
      new Map(
        computeBucketedCardGrades(inputs, scheme, {
          // Grade at the provisional floor so these lenses have coverage
          // comparable to the global column, which grades on very small
          // samples. Everything below the full floor is flagged provisional.
          minDenominator: CARD_GRADE_PROVISIONAL_MIN_DENOMINATOR,
        }).map((grade) => [grade.key, grade]),
      ),
    )
  }

  return {
    ...payload,
    bucketedGradeBasis: useGih ? 'GIH WR' : 'GP WR',
    cards: cards.map((card) => {
      if (card?.isLeader || card?.isBase) return card
      const key = cardDataRowStrictKey(card)
      const gradesByScheme: Record<string, any> = {}
      for (const [scheme, byKey] of bySchemeByKey.entries()) {
        const grade = byKey.get(key)
        if (!grade) continue
        gradesByScheme[scheme] = {
          grade: grade.grade,
          status: grade.status,
          provisional: grade.provisional,
          statusLabel: grade.provisional ? 'Provisional' : gradeStatusLabel(grade.status),
          bucketKey: grade.bucketKey,
          bucketLabel: grade.bucketLabel,
        }
      }
      return { ...card, gradesByScheme }
    }),
  }
}

/**
 * Best card record per pick identity for resolving cost, art, and metadata —
 * preferring this set's Normal printing.
 */
function buildPickCardMetaLookup(allCards: RawCard[], setCode: string): Map<string, RawCard> {
  const score = (card: RawCard) =>
    (card.set === setCode ? 2 : 0) + (card.variantType === 'Normal' ? 1 : 0)
  const lookup = new Map<string, RawCard>()
  for (const card of allCards) {
    const key = pickIdentityKey(card.name, card.subtitle)
    const existing = lookup.get(key)
    if (!existing || score(card) > score(existing)) lookup.set(key, card)
  }
  return lookup
}

function syntheticPickRow(meta: RawCard, isLeader: boolean) {
  return {
    cardName: meta.name,
    cardId: meta.cardId || meta.id || null,
    subtitle: meta.subtitle || null,
    rarity: meta.rarity || 'Unknown',
    cardType: meta.type || (isLeader ? 'Leader' : 'Unit'),
    aspects: Array.isArray(meta.aspects) ? meta.aspects : [],
    cost: meta.cost ?? null,
    imageUrl: meta.imageUrl || null,
    backImageUrl: meta.backImageUrl || null,
    collectorNumber: meta.cardId || meta.number || null,
    setCode: meta.set || null,
    isLeader,
    isBase: false,
    deckCount: 0,
    rawCopies: 0,
    gpCount: 0,
    gpWins: 0,
    gpWr: null,
    ohCount: null,
    ohWr: null,
    gdCount: null,
    gdWr: null,
    gihCount: null,
    gihWr: null,
    gnsCount: null,
    gnsWr: null,
    iih: null,
    playedRate: null,
    resourcedWhenSeen: null,
    playedWar: null,
    sampleWarning: null,
  }
}

/**
 * Switch tier grades to draft pick preference for sets with committed pick
 * data (src/data/pickPreferences/): leaders graded from Plackett-Luce
 * strengths over leader-round choice sets, deck cards from within-aspect
 * Bradley-Terry strengths, both mapped onto the existing letter bands via
 * log-strength z-scores. Win-rate columns remain as metrics; they no longer
 * decide tiers for covered sets.
 *
 * Sets without a data file are untouched (per-set behavior rule), as is any
 * file that predates the v2 strengths. Graded cards missing from the slice
 * (never in a recorded-match deck) are appended with empty win-rate metrics so
 * the tier list is complete.
 */
export function withPickPreferenceGrades<T extends { setCode?: string; leaders?: any[]; bases?: any[]; cards?: any[] }>(
  payload: T,
  allCards: RawCard[],
  statsOverride?: PickPreferenceSetStats | null,
): T {
  const stats: PickPreferenceSetStats | null = statsOverride !== undefined
    ? statsOverride
    : pickPreferenceStatsForSet(payload?.setCode)
  if (!stats) return payload

  const hasCardStrengths = stats.cards.some((card) => card.bt != null && card.bt > 0)
  const leaderStats = stats.leaders || []
  const hasLeaderStrengths = leaderStats.some((leader) => leader.strength != null && leader.strength > 0)
  if (!hasCardStrengths && !hasLeaderStrengths) return payload

  const minSeen = stats.minSeen
  const metaLookup = buildPickCardMetaLookup(allCards, String(payload.setCode))
  const rowKey = (row: any) => pickIdentityKey(row.cardName || row.name, row.subtitle)

  const cardGrades = hasCardStrengths ? computeCardPickGrades(stats.cards, { minSeen }) : new Map<string, PickGrade>()
  const leaderGrades = hasLeaderStrengths ? computeLeaderPickGrades(leaderStats, { minSeen }) : new Map<string, PickGrade>()
  const cardStatsByKey = new Map(stats.cards.map((card) => [pickIdentityKey(card.name, card.subtitle), card]))
  const leaderStatsByKey = new Map(leaderStats.map((leader) => [pickIdentityKey(leader.name, leader.subtitle), leader]))

  const costByKey = new Map(
    stats.cards.map((card) => {
      const key = pickIdentityKey(card.name, card.subtitle)
      return [key, metaLookup.get(key)?.cost ?? null] as const
    }),
  )
  const bucketedByScheme = hasCardStrengths
    ? {
        cost: computeBucketedCardPickGrades(stats.cards, costByKey, 'cost', { minSeen }),
        'curve-slot': computeBucketedCardPickGrades(stats.cards, costByKey, 'curve-slot', { minSeen }),
      }
    : null

  const statusLabel = (grade: PickGrade | undefined) => {
    if (!grade) return pickGradeStatusLabel('sample-too-small', minSeen)
    return grade.provisional ? 'Provisional' : pickGradeStatusLabel(grade.status, minSeen)
  }

  const gradesBySchemeFor = (key: string) => {
    if (!bucketedByScheme) return {}
    const schemes: Record<string, any> = {}
    for (const [scheme, byKey] of Object.entries(bucketedByScheme)) {
      const grade = byKey.get(key)
      if (!grade) continue
      schemes[scheme] = {
        grade: grade.grade,
        status: grade.status,
        provisional: grade.provisional,
        statusLabel: grade.provisional ? 'Provisional' : pickGradeStatusLabel(grade.status, minSeen),
        bucketKey: grade.bucketKey,
        bucketLabel: grade.bucketLabel,
      }
    }
    return schemes
  }

  const decorateLeaderRow = (row: any) => {
    const key = rowKey(row)
    const grade = leaderGrades.get(key)
    const stat = leaderStatsByKey.get(key)
    return {
      ...row,
      grade: grade?.grade ?? null,
      displayGrade: grade?.grade ?? null,
      gradeBasis: PICK_GRADE_BASIS_LEADERS,
      gradeStatus: grade?.status ?? 'sample-too-small',
      gradeStatusLabel: statusLabel(grade),
      gradePolicy: PICK_GRADE_POLICY_LEADERS,
      pickRating: null,
      pickRate: rateToPct(stat?.pickRate),
      inAspectRate: null,
      pickSeen: stat?.seen ?? null,
      ata: stat?.apr ?? null,
    }
  }

  const decorateCardRow = (row: any) => {
    const key = rowKey(row)
    const grade = cardGrades.get(key)
    const stat = cardStatsByKey.get(key)
    return {
      ...row,
      grade: grade?.grade ?? null,
      displayGrade: grade?.grade ?? null,
      gradeBasis: PICK_GRADE_BASIS_CARDS,
      gradeStatus: grade?.status ?? 'sample-too-small',
      gradeStatusLabel: statusLabel(grade),
      gradePolicy: PICK_GRADE_POLICY_CARDS,
      pickRating: stat?.rating ?? null,
      pickRate: rateToPct(stat?.pickRate),
      inAspectRate: rateToPct(stat?.aRate),
      pickSeen: stat?.seen ?? stat?.aSeen ?? null,
      ata: stat?.ata ?? null,
      gradesByScheme: gradesBySchemeFor(key),
    }
  }

  const isLeaderRow = (row: any) => Boolean(row?.isLeader) || String(row?.cardType || '').toLowerCase().includes('leader')
  const isBaseRow = (row: any) => Boolean(row?.isBase) || String(row?.cardType || '').toLowerCase().includes('base')

  const decorateRow = (row: any) => {
    if (isBaseRow(row)) return row
    if (isLeaderRow(row)) return hasLeaderStrengths ? decorateLeaderRow(row) : row
    return hasCardStrengths ? decorateCardRow(row) : row
  }

  const leaders = (payload.leaders || []).map(decorateRow)
  const cards = (payload.cards || []).map(decorateRow)

  // Complete the tier list: graded identities the slice never saw (no recorded
  // matches yet) still belong on it.
  const presentKeys = new Set([...leaders, ...cards, ...(payload.bases || [])].map(rowKey))
  // Only this set's own cards qualify — carbonite drafts leak old-set leaders
  // into the pick data as one-off sightings, and those don't belong on the
  // set's tier list.
  if (hasLeaderStrengths) {
    for (const leader of leaderStats) {
      const key = pickIdentityKey(leader.name, leader.subtitle)
      if (presentKeys.has(key)) continue
      const meta = metaLookup.get(key)
      if (!meta || meta.set !== payload.setCode) continue
      presentKeys.add(key)
      leaders.push(decorateLeaderRow(syntheticPickRow(meta, true)))
    }
  }
  if (hasCardStrengths) {
    for (const card of stats.cards) {
      const key = pickIdentityKey(card.name, card.subtitle)
      if (presentKeys.has(key)) continue
      const meta = metaLookup.get(key)
      if (!meta || meta.set !== payload.setCode) continue
      if (meta.isLeader || meta.isBase || meta.type === 'Leader' || meta.type === 'Base') continue
      presentKeys.add(key)
      cards.push(decorateCardRow(syntheticPickRow(meta, false)))
    }
  }

  const byGradeThenRating = (a: any, b: any) =>
    (GRADE_SORT[b.displayGrade ?? ''] ?? -1) - (GRADE_SORT[a.displayGrade ?? ''] ?? -1) ||
    (b.pickRating ?? -1) - (a.pickRating ?? -1) ||
    (b.pickRate ?? -1) - (a.pickRate ?? -1) ||
    String(a.cardName || '').localeCompare(String(b.cardName || ''))

  return {
    ...payload,
    gradeMethodology: 'pick-preference',
    gradeBasis: PICK_GRADE_BASIS_CARDS,
    bucketedGradeBasis: PICK_GRADE_BASIS_CARDS,
    pickDataGeneratedAt: stats.generatedAt || null,
    leaders: leaders.sort(byGradeThenRating),
    cards: cards.sort(byGradeThenRating),
  }
}

function finalizeCardDataPayload<T extends { leaders?: any[]; bases?: any[]; cards?: any[] }>(
  payload: T,
  allCards: RawCard[],
): T {
  return enrichPayloadWithHyperspaceImages(
    withPickPreferenceGrades(withBucketedCardGrades(payload), allCards),
    allCards,
  )
}

function mergeWayfinderReplayMetrics(payload: any, wayfinderPayload: any) {
  const wayfinderRows = [
    ...(wayfinderPayload?.leaders || []),
    ...(wayfinderPayload?.bases || []),
    ...(wayfinderPayload?.cards || []),
  ]
  if (wayfinderRows.length === 0) return payload

  return {
    ...payload,
    sourceDetail: 'local-wayfinder',
    replayMetricsStatus: wayfinderPayload.replayMetricsStatus,
    leaders: mergeWayfinderReplayRows(payload.leaders || [], wayfinderRows),
    bases: mergeWayfinderReplayRows(payload.bases || [], wayfinderRows),
    cards: mergeWayfinderReplayRows(payload.cards || [], wayfinderRows),
  }
}

async function fetchWayfinderCardData(setCode: string, format: string) {
  const url = wayfinderStatsUrl(setCode)
  if (!url) return null

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
  })
  if (!response.ok) return null

  const body = await response.json()
  const rows = body?.data?.rows
  if (!Array.isArray(rows) || rows.length === 0) return null

  return mapWayfinderRowsToCardDataStats({ rows, setCode, format })
}

function newBucket(card: any) {
  return {
    card,
    deckCount: 0,
    rawCopies: 0,
    gpCount: 0,
    gpWins: 0,
    matchWins: 0,
    matchLosses: 0,
    matchDraws: 0,
  }
}

function addMetricFact(
  map: Map<string, any>,
  normalCardMap: Map<string, any>,
  card: any,
  copies: number,
  wins: number,
  losses: number,
  draws: number,
) {
  if (!card || copies <= 0) return
  const normal = normalCardMap.get(cardIdentityKey(card)) || card
  const key = cardIdentityKey(normal)
  const matches = wins + losses + draws
  if (matches <= 0) return

  const current = map.get(key) || newBucket(normal)
  current.deckCount += 1
  current.rawCopies += copies
  current.gpCount += copies * matches
  current.gpWins += copies * wins
  current.matchWins += wins
  current.matchLosses += losses
  current.matchDraws += draws
  map.set(key, current)
}

function buildMetricRows(map: Map<string, any>, normalCardMap: Map<string, any>) {
  const gradeInputs = Array.from(map.entries()).map(([key, value]) => ({
    key,
    wins: value.gpWins,
    denominator: value.gpCount,
  }))
  const grades = new Map(computeCardGrades(gradeInputs).map((grade) => [grade.key, grade]))

  return Array.from(map.entries()).map(([key, value]) => {
    const card = value.card || normalCardMap.get(key)
    const isLeader = Boolean(card?.isLeader || card?.type === 'Leader')
    const isBase = Boolean(card?.isBase || card?.type === 'Base')
    const grade = grades.get(key)
    const gpWr = pct(value.gpWins, value.gpCount)
    const displayGrade = isLeader ? leaderGradeFromWinRate(gpWr, value.gpCount) : grade?.grade || null
    const status = grade?.status || 'sample-too-small'
    const gradeStatus = isLeader
      ? displayGrade ? 'graded' : 'sample-too-small'
      : status
    const gradePolicy = isLeader
      ? 'leader-win-rate'
      : displayGrade ? 'local-gp-strict' : 'ungraded'

    return {
      cardName: card?.name || key.split('|')[0],
      cardId: card?.cardId || card?.id || null,
      subtitle: card?.subtitle || null,
      rarity: card?.rarity || 'Unknown',
      cardType: card?.type || 'Unknown',
      aspects: card?.aspects || [],
      cost: card?.cost ?? null,
      imageUrl: card?.imageUrl || null,
      backImageUrl: card?.backImageUrl || null,
      collectorNumber: card?.cardId || card?.number || null,
      setCode: card?.set || null,
      isLeader,
      isBase,
      grade: displayGrade,
      displayGrade,
      gradeBasis: isLeader ? 'Leader WR' : 'GP WR',
      gradeStatus,
      gradeStatusLabel: gradeStatusLabel(gradeStatus),
      gradePolicy,
      deckCount: value.deckCount,
      rawCopies: value.rawCopies,
      gpCount: value.gpCount,
      gpWins: value.gpWins,
      gpWr,
      ohCount: null,
      ohWr: null,
      gdCount: null,
      gdWr: null,
      gihCount: null,
      gihWr: null,
      gnsCount: null,
      gnsWr: null,
      iih: null,
      playedRate: null,
      resourcedWhenSeen: null,
      playedWar: null,
      sampleWarning: value.gpCount < 50 ? 'Low sample' : null,
    }
  }).sort((a, b) => {
    const gradeCmp = (GRADE_SORT[b.grade ?? ''] ?? -1) - (GRADE_SORT[a.grade ?? ''] ?? -1)
    if (gradeCmp !== 0) return gradeCmp
    return (b.gpWr ?? -1) - (a.gpWr ?? -1) || b.gpCount - a.gpCount || a.cardName.localeCompare(b.cardName)
  })
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'
    const format = url.searchParams.get('format') || url.searchParams.get('poolType') || 'all'
    const source = url.searchParams.get('source') || 'all'
    const includeHumans = url.searchParams.get('includeHumans') !== 'false'
    const tournamentOnly = url.searchParams.get('tournamentOnly') === 'true'
    const topPlayersOnly = url.searchParams.get('topPlayersOnly') === 'true'
    const userId = url.searchParams.get('userId') || null

    // Locked cohorts (Competitive / Top Players) are patron/admin-only. Gate
    // server-side before any data path (including the Wayfinder preferred
    // source) so the values never reach a non-entitled client. You/All public.
    if (tournamentOnly || topPlayersOnly) {
      await requireFullStatsAccess(request)
    }

    const shouldPreferWayfinder = shouldPreferWayfinderCardData({
      format,
      source,
      tournamentOnly,
      topPlayersOnly,
      userId,
    })

    if (shouldPreferWayfinder) {
      try {
        const wayfinderPayload = await fetchWayfinderCardData(setCode, format)
        if (wayfinderPayload) {
          const response = jsonResponse(finalizeCardDataPayload(wayfinderPayload, getAllCards()))
          response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
          return response
        }
      } catch (error) {
        console.warn('[card-data] Wayfinder preferred source failed:', error)
      }
    }

    const allCards = getAllCards()
    const { cardMap, normalCardMap } = buildCardLookupMaps(allCards)

    const formatFilter = format !== 'all' ? `AND COALESCE(bd.pool_type, cp.pool_type) = $4` : ''
    const queryParams: (string | string[])[] = format !== 'all'
      ? [setCode, since, until, format]
      : [setCode, since, until]

    let tournamentFilter = ''
    if (tournamentOnly) {
      queryParams.push(tournamentUserIds)
      tournamentFilter = `AND bd.user_id = ANY($${queryParams.length}::uuid[])`
    }

    let topPlayersJoin = ''
    if (topPlayersOnly) {
      topPlayersJoin = `JOIN top_players tp ON tp.user_id = bd.user_id`
    }

    let userFilter = ''
    if (userId) {
      queryParams.push(userId)
      userFilter = `AND bd.user_id = $${queryParams.length}::uuid`
    }

    // Existing public stats intentionally exclude bots regardless of the toggle.
    // Keep card data aligned with the rest of /stats.
    const botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`
    const humanFilter = includeHumans ? '' : `AND false`
    const sourceFilter = source === 'online'
      ? `AND COALESCE(array_length(cp.wayfinder_match_ids, 1), 0) > 0`
      : source === 'in-person'
        ? `AND COALESCE(array_length(cp.wayfinder_match_ids, 1), 0) = 0`
        : ''

    const rows = await cachedAggregate(
      `card-data:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      () => queryRows(
        `SELECT
           bd.id AS deck_id,
           bd.deck AS deck,
           bd.leader AS leader,
           bd.base AS base,
           COALESCE(bd.pool_type, cp.pool_type) AS pool_type,
           cp.wins,
           cp.losses,
           cp.draws,
           COALESCE(array_length(cp.wayfinder_match_ids, 1), 0) AS linked_match_count
         FROM built_decks bd
         JOIN card_pools cp ON cp.id = bd.card_pool_id
         LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND bd.user_id = dpp.user_id
         ${topPlayersJoin}
         WHERE ($1 = 'all' OR bd.set_code = $1)
           AND cp.created_at >= $2
           AND cp.created_at < ($3::date + interval '1 day')
           ${formatFilter}
           ${botFilter}
           ${humanFilter}
           ${sourceFilter}
           ${tournamentFilter}
           ${userFilter}
           AND (COALESCE(cp.wins, 0) + COALESCE(cp.losses, 0) + COALESCE(cp.draws, 0)) > 0`,
        queryParams,
      ),
    )

    const byCard = new Map<string, any>()
    const byLeader = new Map<string, any>()
    const byBase = new Map<string, any>()

    let totalDecks = 0
    let totalMatches = 0
    let onlineLinkedDecks = 0

    for (const row of rows) {
      const wins = num(row.wins)
      const losses = num(row.losses)
      const draws = num(row.draws)
      const matches = wins + losses + draws
      if (matches <= 0) continue

      totalDecks += 1
      totalMatches += matches
      if (num(row.linked_match_count) > 0) onlineLinkedDecks += 1

      const leader = resolveCard(cardMap, row.leader) || fallbackStoredCard(row.leader, 'Leader')
      const base = resolveCard(cardMap, row.base) || fallbackStoredCard(row.base, 'Base')
      addMetricFact(byLeader, normalCardMap, leader, 1, wins, losses, draws)
      addMetricFact(byBase, normalCardMap, base, 1, wins, losses, draws)

      const seenInDeck = new Set<string>()
      for (const entry of Array.isArray(row.deck) ? row.deck : []) {
        const card = resolveCard(cardMap, entry)
        if (!card || card.isLeader || card.isBase || card.type === 'Leader' || card.type === 'Base') continue

        const normal = normalCardMap.get(cardIdentityKey(card)) || card
        const key = cardIdentityKey(normal)
        const copies = entryCopies(entry)
        if (copies <= 0) continue

        if (!seenInDeck.has(key)) {
          const current = byCard.get(key) || newBucket(normal)
          current.deckCount += 1
          current.matchWins += wins
          current.matchLosses += losses
          current.matchDraws += draws
          byCard.set(key, current)
          seenInDeck.add(key)
        }
        const current = byCard.get(key) || newBucket(normal)
        current.rawCopies += copies
        current.gpCount += copies * matches
        current.gpWins += copies * wins
        byCard.set(key, current)
      }
    }

    const cards = buildMetricRows(byCard, normalCardMap)
    const leaders = buildMetricRows(byLeader, normalCardMap)
    const bases = buildMetricRows(byBase, normalCardMap)

    let payload = {
      setCode,
      format,
      source,
      totalDecks,
      totalMatches,
      onlineLinkedDecks,
      replayMetricsStatus: 'unavailable',
      gradeBasis: 'GP WR',
      leaders,
      bases,
      cards,
    }

    const hasLocalCards = cards.length > 0 || leaders.length > 0 || bases.length > 0
    if (hasLocalCards && source !== 'in-person') {
      try {
        const wayfinderPayload = await fetchWayfinderCardData(setCode, format)
        if (wayfinderPayload) {
          payload = mergeWayfinderReplayMetrics(payload, wayfinderPayload)
        }
      } catch (error) {
        console.warn('[card-data] Wayfinder replay merge failed:', error)
      }
    }

    if (!hasLocalCards && source !== 'in-person') {
      try {
        const wayfinderPayload = await fetchWayfinderCardData(setCode, format)
        if (wayfinderPayload) {
          const response = jsonResponse(finalizeCardDataPayload(wayfinderPayload, allCards))
          response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
          return response
        }
      } catch (error) {
        console.warn('[card-data] Wayfinder fallback failed:', error)
      }
    }

    payload = finalizeCardDataPayload(payload, allCards)

    const response = jsonResponse(payload)
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
