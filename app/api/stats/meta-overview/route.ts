// GET /api/stats/meta-overview?setCode=ASH&poolType=draft
//
// The site-wide numbers behind the Meta overview that no other stats route
// returns: headline counts, leader-vs-leader matchups from recorded matches,
// and the cost curve of winning decks vs every built deck. Bots never count.
import { queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { getAllCards, getCardsBySet, getLeaders } from '@/src/utils/cardData'
import { buildCardLookupMaps } from '@/src/utils/cardNormalization'
import { buildLeaderMatchups, type MatchupSourceRow } from '@/src/services/meta/leaderMatchups'
import { buildCurveComparison, type CurveDeck } from '@/src/services/meta/deckCurve'
import { NextRequest, NextResponse } from 'next/server'

const SET_CODE_RE = /^[A-Z]{3}(?:-CB)?$/
const POOL_TYPES = new Set(['sealed', 'draft'])
const MATCHUP_LEADERS = 8
const MATCHUP_MIN_MATCHES = 20

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = (url.searchParams.get('setCode') || '').trim()
    if (!SET_CODE_RE.test(setCode)) {
      return errorResponse('Invalid or missing setCode', 400) as unknown as NextResponse
    }
    const rawPoolType = url.searchParams.get('poolType')
    const poolType = rawPoolType && POOL_TYPES.has(rawPoolType) ? rawPoolType : null
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'
    const params = [setCode, since, until, poolType]

    const data = await cachedAggregate(`meta-overview:${setCode}:${poolType}:${since}:${until}`, STATS_AGGREGATE_TTL_MS, async () => {
      const [matchRows, deckRows] = await Promise.all([
        queryRows(
          `SELECT cm.player_leader, cm.opponent_leader, cm.result
           FROM casual_matches cm
           JOIN card_pools cp ON cp.id = cm.card_pool_id
           WHERE cp.set_code = $1
             AND cm.played_at >= $2 AND cm.played_at < ($3::date + interval '1 day')
             AND ($4::text IS NULL OR cp.pool_type = $4)
             AND cm.retracted_at IS NULL`,
          params,
        ),
        queryRows(
          `SELECT bd.deck, cp.wins, cp.losses
           FROM built_decks bd
           JOIN card_pools cp ON cp.id = bd.card_pool_id
           LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
           WHERE bd.set_code = $1
             AND bd.built_at >= $2 AND bd.built_at < ($3::date + interval '1 day')
             AND ($4::text IS NULL OR cp.pool_type = $4)
             AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`,
          params,
        ),
      ])

      const { cardMap } = buildCardLookupMaps(getAllCards())
      const decks: CurveDeck[] = []
      for (const row of deckRows) {
        const entries = Array.isArray(row.deck) ? row.deck : []
        const costs: number[] = []
        for (const entry of entries) {
          const card = (entry?.id && cardMap.get(entry.id)) || (entry?.cardId && cardMap.get(entry.cardId)) || null
          if (!card || card.type === 'Leader' || card.type === 'Base' || typeof card.cost !== 'number') continue
          const copies = Math.max(1, Number(entry?.count) || 1)
          for (let i = 0; i < copies; i++) costs.push(card.cost)
        }
        if (costs.length) decks.push({ costs, wins: Number(row.wins) || 0, losses: Number(row.losses) || 0 })
      }

      const matchups = buildLeaderMatchups(matchRows as unknown as MatchupSourceRow[], { limit: MATCHUP_LEADERS, minMatches: MATCHUP_MIN_MATCHES })
      const art = new Map<string, string | null>()
      for (const card of getLeaders(getCardsBySet(setCode.replace(/-CB$/, '')))) {
        if (card?.name && !art.has(card.name.toLowerCase())) art.set(card.name.toLowerCase(), card.backImageUrl || card.imageUrl || null)
      }

      return {
        kpis: {
          recordedMatches: matchRows.length,
          decksBuilt: deckRows.length,
          decksWithResults: decks.filter((d) => d.wins + d.losses > 0).length,
        },
        matchups: {
          ...matchups,
          leaderImages: matchups.leaders.map((name) => art.get(name.toLowerCase()) || null),
          minMatches: MATCHUP_MIN_MATCHES,
        },
        curve: buildCurveComparison(decks),
      }
    })

    const response = jsonResponse({ setCode, poolType, ...data })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
