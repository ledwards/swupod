export interface WayfinderCardStatsRow {
  slug: string
  cardUuid: string | null
  name: string
  subtitle: string | null
  type: string
  aspects: string[]
  cost: number | null
  setCode: string | null
  rarity: string | null
  imageUrl?: string | null
  backImageUrl?: string | null
  deckCount: number
  totalDecks: number
  deckGames: number
  gpWins: number
  gpWr: number | null
  ohGames: number | null
  ohWr: number | null
  gdGames: number | null
  gdWr: number | null
  gihGames: number | null
  gihWr: number | null
  gnsGames: number | null
  gnsWr: number | null
  iih: number | null
  playedRate: number | null
  resourcedWhenSeenRate: number | null
  playedWar: number | null
  grade: string | null
  gradeMetricLabel: string
  gradeBasis: 'decklist' | 'replay'
  handMetricsStatus: 'unavailable' | 'unvalidated' | 'available'
  sampleWarning: string | null
}

export interface WayfinderCardStatsEnvelope {
  rows: WayfinderCardStatsRow[]
  total: number
  grandTotal: number
}

interface WayfinderCardStatsApiResponse {
  data?: WayfinderCardStatsEnvelope
  rows?: WayfinderCardStatsRow[]
  total?: number
  grandTotal?: number
}

export interface SwupodCardStatsBridgeRow {
  cardName: string
  cardId: string | null
  subtitle: string | null
  rarity: string
  cardType: string
  aspects: string[]
  cost: number | null
  imageUrl: string | null
  backImageUrl: string | null
  isLeader: boolean
  isBase: boolean
  grade: string | null
  gradeBasis: string
  gradeStatus: string
  gradeStatusLabel: string
  deckCount: number
  rawCopies: number
  gpCount: number
  gpWins: number
  gpWr: number | null
  ohCount: number | null
  ohWr: number | null
  gdCount: number | null
  gdWr: number | null
  gihCount: number | null
  gihWr: number | null
  gnsCount: number | null
  gnsWr: number | null
  iih: number | null
  playedRate: number | null
  resourcedWhenSeen: number | null
  playedWar: number | null
  sampleWarning: string | null
}

export interface WayfinderCardStatsBridgeResult {
  rows: SwupodCardStatsBridgeRow[]
  totalDecks: number | null
  replayMetricsStatus: 'available' | 'unvalidated'
  gradeBasis: string
}

export interface WayfinderCardStatsBridgeParams {
  setCode: string
  since?: string | null
  until?: string | null
  format?: string | null
  source?: string | null
  userId?: string | null
  tournamentOnly?: boolean
  topPlayersOnly?: boolean
}

type FetchLike = typeof fetch

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function ratioToPercent(value: unknown): number | null {
  const parsed = nullableNumber(value)
  return parsed == null ? null : Math.round(parsed * 1000) / 10
}

function bridgeGradeStatus(row: WayfinderCardStatsRow): string {
  if (row.grade) return row.sampleWarning?.includes('Provisional') ? 'provisional' : 'graded'
  return row.sampleWarning ? 'sample-too-small' : 'ungraded'
}

function bridgeGradeStatusLabel(row: WayfinderCardStatsRow): string {
  if (row.sampleWarning) return row.sampleWarning
  if (row.grade) return row.gradeBasis === 'replay' ? 'GIH WR grade' : 'GP WR grade'
  return 'Not enough graded-card sample'
}

export function mapWayfinderCardStatsRow(row: WayfinderCardStatsRow): SwupodCardStatsBridgeRow {
  return {
    cardName: row.name,
    cardId: row.cardUuid,
    subtitle: row.subtitle,
    rarity: row.rarity || 'Unknown',
    cardType: row.type || 'Unknown',
    aspects: Array.isArray(row.aspects) ? row.aspects : [],
    cost: row.cost,
    imageUrl: row.imageUrl || null,
    backImageUrl: row.backImageUrl || null,
    isLeader: false,
    isBase: false,
    grade: row.grade,
    gradeBasis: row.gradeMetricLabel || (row.gradeBasis === 'replay' ? 'GIH WR' : 'GP WR'),
    gradeStatus: bridgeGradeStatus(row),
    gradeStatusLabel: bridgeGradeStatusLabel(row),
    deckCount: numberValue(row.deckCount),
    rawCopies: numberValue(row.deckGames),
    gpCount: numberValue(row.deckGames),
    gpWins: numberValue(row.gpWins),
    gpWr: ratioToPercent(row.gpWr),
    ohCount: nullableNumber(row.ohGames),
    ohWr: ratioToPercent(row.ohWr),
    gdCount: nullableNumber(row.gdGames),
    gdWr: ratioToPercent(row.gdWr),
    gihCount: nullableNumber(row.gihGames),
    gihWr: ratioToPercent(row.gihWr),
    gnsCount: nullableNumber(row.gnsGames),
    gnsWr: ratioToPercent(row.gnsWr),
    iih: nullableNumber(row.iih),
    playedRate: ratioToPercent(row.playedRate),
    resourcedWhenSeen: ratioToPercent(row.resourcedWhenSeenRate),
    playedWar: nullableNumber(row.playedWar),
    sampleWarning: row.sampleWarning,
  }
}

export function shouldFetchWayfinderReplayCardStats(params: WayfinderCardStatsBridgeParams): boolean {
  if (params.source === 'in-person') return false
  if (params.userId || params.tournamentOnly || params.topPlayersOnly) return false
  return true
}

export function wayfinderFormatForSwupodFormat(_format: string | null | undefined): 'limited' {
  return 'limited'
}

export function wayfinderCardStatsApiUrl(): string {
  const explicit = process.env.WAYFINDER_CARD_STATS_API_URL?.trim()
  if (explicit) return explicit

  const base = (
    process.env.WAYFINDER_CARD_STATS_BASE_URL ||
    process.env.NEXT_PUBLIC_WAYFINDER_URL ||
    'https://plugin.wayfinder.news'
  ).replace(/\/+$/, '')
  return `${base}/api/cards/stats`
}

export function buildWayfinderCardStatsUrl(params: WayfinderCardStatsBridgeParams): string {
  const url = new URL(wayfinderCardStatsApiUrl())
  url.searchParams.set('era', params.setCode)
  url.searchParams.set('format', wayfinderFormatForSwupodFormat(params.format))
  url.searchParams.set('sources', 'karabast,ptp')
  url.searchParams.set('limit', 'all')
  if (params.since) url.searchParams.set('from', params.since)
  if (params.until) url.searchParams.set('to', params.until)
  return url.toString()
}

export async function fetchWayfinderReplayCardStats(
  params: WayfinderCardStatsBridgeParams,
  fetchImpl: FetchLike = fetch,
): Promise<WayfinderCardStatsBridgeResult | null> {
  if (!shouldFetchWayfinderReplayCardStats(params)) return null

  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = process.env.WAYFINDER_CARD_STATS_API_TOKEN?.trim()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetchImpl(buildWayfinderCardStatsUrl(params), {
    headers,
    next: { revalidate: 300 },
  } as RequestInit)

  if (!response.ok) return null
  const payload = await response.json() as WayfinderCardStatsApiResponse
  const envelope = payload.data ?? payload as WayfinderCardStatsEnvelope
  const rows = Array.isArray(envelope.rows) ? envelope.rows.map(mapWayfinderCardStatsRow) : []
  if (rows.length === 0) return null

  const first = envelope.rows[0]
  const replayMetricsStatus = envelope.rows.some((row) => row.handMetricsStatus === 'available' || numberValue(row.gihGames) > 0)
    ? 'available'
    : 'unvalidated'

  return {
    rows,
    totalDecks: numberValue(first?.totalDecks) || null,
    replayMetricsStatus,
    gradeBasis: first?.gradeMetricLabel || (first?.gradeBasis === 'replay' ? 'GIH WR' : 'GP WR'),
  }
}
