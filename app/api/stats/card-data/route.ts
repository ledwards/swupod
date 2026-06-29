// GET /api/stats/card-data - 17Lands-style card data, currently backed by decklist + match-result facts.
import { queryRows } from '@/lib/db'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps, cardIdentityKey } from '@/src/utils/cardNormalization'
import { computeCardGrades } from '@/src/services/cardDataMetrics'
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
  if (status === 'sample-too-small') return 'Needs 50+ GP'
  if (status === 'slice-too-small') return 'Needs 25 cards'
  if (status === 'zero-variance') return 'No spread'
  return status
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
  return url.toString()
}

function mapWayfinderRow(row: WayfinderCardStatsRow) {
  const cardType = row.type || 'Unknown'
  const gpCount = num(row.deckGames)
  const ohCount = row.ohGames == null ? null : num(row.ohGames)
  const gdCount = row.gdGames == null ? null : num(row.gdGames)
  const gihCount = row.gihGames == null ? null : num(row.gihGames)
  const gnsCount = row.gnsGames == null ? null : num(row.gnsGames)
  const gradeStatus = row.grade ? 'graded' : 'sample-too-small'

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
    collectorNumber: row.collectorNumber || null,
    setCode: row.setCode || null,
    isLeader: cardType.toLowerCase().includes('leader'),
    isBase: cardType.toLowerCase().includes('base'),
    grade: row.grade || null,
    gradeBasis: row.gradeMetricLabel || 'GIH WR',
    gradeStatus,
    gradeStatusLabel: row.grade ? 'Graded' : gradeStatusLabel(gradeStatus),
    deckCount: num(row.deckCount),
    rawCopies: gpCount,
    gpCount,
    gpWins: num(row.gpWins),
    gpWr: rateToPct(row.gpWr),
    ohCount,
    ohWins: winsFromRate(row.ohWr, row.ohGames),
    ohWr: rateToPct(row.ohWr),
    gdCount,
    gdWins: winsFromRate(row.gdWr, row.gdGames),
    gdWr: rateToPct(row.gdWr),
    gihCount,
    gihWins: winsFromRate(row.gihWr, row.gihGames),
    gihWr: rateToPct(row.gihWr),
    gnsCount,
    gnsWins: winsFromRate(row.gnsWr, row.gnsGames),
    gnsWr: rateToPct(row.gnsWr),
    iih: rateToPct(row.iih),
    playedRate: rateToPct(row.playedRate),
    resourcedWhenSeen: rateToPct(row.resourcedWhenSeenRate),
    playedWar: rateToPct(row.playedWar),
    sampleWarning: row.sampleWarning || null,
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
    const grade = grades.get(key)
    const status = grade?.status || 'sample-too-small'

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
      isLeader: Boolean(card?.isLeader || card?.type === 'Leader'),
      isBase: Boolean(card?.isBase || card?.type === 'Base'),
      grade: grade?.grade || null,
      gradeBasis: 'GP WR',
      gradeStatus: status,
      gradeStatusLabel: grade?.grade ? 'Graded' : gradeStatusLabel(status),
      deckCount: value.deckCount,
      rawCopies: value.rawCopies,
      gpCount: value.gpCount,
      gpWins: value.gpWins,
      gpWr: pct(value.gpWins, value.gpCount),
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

    const shouldPreferWayfinder =
      (format === 'all' || format === 'limited') &&
      source === 'online' &&
      !tournamentOnly &&
      !topPlayersOnly &&
      !userId

    if (shouldPreferWayfinder) {
      try {
        const wayfinderPayload = await fetchWayfinderCardData(setCode, format)
        if (wayfinderPayload) {
          const response = jsonResponse(wayfinderPayload)
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

    const payload = {
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
    if (!hasLocalCards && (format === 'all' || format === 'limited') && source !== 'in-person') {
      try {
        const wayfinderPayload = await fetchWayfinderCardData(setCode, format)
        if (wayfinderPayload) {
          const response = jsonResponse(wayfinderPayload)
          response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
          return response
        }
      } catch (error) {
        console.warn('[card-data] Wayfinder fallback failed:', error)
      }
    }

    const response = jsonResponse(payload)
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
