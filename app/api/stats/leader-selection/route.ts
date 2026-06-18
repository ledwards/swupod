// @ts-nocheck
// GET /api/stats/leader-selection - Get leader selection rates from built decks
import { queryRows, queryRow } from '@/lib/db'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps } from '@/src/utils/cardNormalization'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'
    const poolType = url.searchParams.get('poolType') || null
    // Availability-normalized rate: timesSelected / pools that HAD the leader
    // available (not / all decks) — so a leader that's rare in pools but always
    // built isn't penalised vs a common one. Opt-in so /stats stays unchanged.
    const normalized = url.searchParams.get('normalized') === 'true'
    const includeBots = url.searchParams.get('includeBots') === 'true'
    const includeHumans = url.searchParams.get('includeHumans') !== 'false'
    const tournamentOnly = url.searchParams.get('tournamentOnly') === 'true'
    const topPlayersOnly = url.searchParams.get('topPlayersOnly') === 'true'
    const userId = url.searchParams.get('userId') || null
    // Restrict to decks built by a signed-in (registered) player. Anonymous
    // builds have a NULL user_id; this is the "logged-in players" segment.
    const loggedInOnly = url.searchParams.get('loggedInOnly') === 'true'
    const loggedInFilter = loggedInOnly ? `AND bd.user_id IS NOT NULL` : ''

    // Build card lookup maps — all variants merge to same card via name|type key
    // See src/utils/cardNormalization.ts for the canonical normalization pattern
    const allCards = getAllCards()
    const { cardMap } = buildCardLookupMaps(allCards)

    // Bots are NEVER counted in stats — always exclude, regardless of params.
    const botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`
    const joinClause = `LEFT JOIN card_pools cp ON cp.id = bd.card_pool_id LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND bd.user_id = dpp.user_id`

    const poolTypeFilter = poolType ? `AND bd.pool_type = $4` : ''
    const queryParams: (string | string[])[] = poolType ? [setCode, since, until, poolType] : [setCode, since, until]

    let tournamentFilter = ''
    if (tournamentOnly) {
      queryParams.push(tournamentUserIds)
      tournamentFilter = `AND bd.user_id = ANY($${queryParams.length}::uuid[])`
    }

    // Top players filter (from top_players table)
    let topPlayersJoin = ''
    if (topPlayersOnly) {
      topPlayersJoin = `JOIN top_players tp ON tp.user_id = bd.user_id`
    }

    // Single user filter
    let userFilter = ''
    if (userId) {
      queryParams.push(userId)
      userFilter = `AND bd.user_id = $${queryParams.length}::uuid`
    }

    // Heavy platform-wide all-time scan — cache the result in-process (5 min)
    // so the /me Meta tab's repeated all-time fetches don't re-scan every deck.
    // For the normalized rate: count, per leader card, how many pools had it
    // available (leader card present in cp.cards).
    const cpPoolTypeFilter = poolType ? `AND cp.pool_type = $4` : ''
    const { summary, rows, availability } = await cachedAggregate(
      `leader-selection:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      async () => {
        const [summary, rows, availability] = await Promise.all([
          queryRow(
            `SELECT COUNT(*) AS total_decks
             FROM built_decks bd
             ${joinClause}
             ${topPlayersJoin}
             WHERE ($1 = 'all' OR bd.set_code = $1) AND bd.built_at >= $2 AND bd.built_at < ($3::date + interval '1 day')
               ${poolTypeFilter}
               ${botFilter}
               ${tournamentFilter}
               ${loggedInFilter}
               ${userFilter}`,
            queryParams
          ),
          queryRows(
            `SELECT bd.leader
             FROM built_decks bd
             ${joinClause}
             ${topPlayersJoin}
             WHERE ($1 = 'all' OR bd.set_code = $1) AND bd.built_at >= $2 AND bd.built_at < ($3::date + interval '1 day')
               ${poolTypeFilter}
               ${botFilter}
               ${tournamentFilter}
               ${loggedInFilter}
               ${userFilter}`,
            queryParams
          ),
          normalized
            ? queryRows(
                `SELECT c->>'cardId' AS card_id, COUNT(DISTINCT cp.id) AS pools
                 FROM card_pools cp,
                 LATERAL jsonb_array_elements(cp.cards) AS c
                 WHERE ($1 = 'all' OR cp.set_code = $1)
                   AND cp.created_at >= $2 AND cp.created_at < ($3::date + interval '1 day')
                   AND (c->>'type' = 'Leader' OR c->>'isLeader' = 'true')
                   AND c->>'cardId' IS NOT NULL
                   ${cpPoolTypeFilter}
                 GROUP BY c->>'cardId'`,
                queryParams
              )
            : Promise.resolve([]),
        ])
        return { summary, rows, availability }
      },
    )

    // poolsAvailable per leader NAME (collapse variant cardIds via cardMap).
    const poolsAvailableByName = new Map<string, number>()
    if (normalized) {
      for (const a of availability || []) {
        const name = cardMap.get(a.card_id)?.name || cardMap.get(a.card_id?.replace(/-/g, '_'))?.name
        if (!name) continue
        poolsAvailableByName.set(name, (poolsAvailableByName.get(name) || 0) + parseInt(a.pools))
      }
    }

    // Aggregate leader selections by name
    const leaderStats = new Map<string, {
      count: number
      cardName: string
      cardId: string
    }>()

    for (const row of rows) {
      const leader = row.leader
      if (!leader) continue
      const leaderId = leader.id || leader.cardId || ''
      const cardData = cardMap.get(leaderId)

      // Skip non-leader cards (data quality: some built_decks have non-leader cards stored as leader)
      if (cardData && cardData.type !== 'Leader') continue

      const name = cardData?.name || leader.name || leader.cardName || 'Unknown'

      if (!leaderStats.has(name)) {
        leaderStats.set(name, { count: 0, cardName: name, cardId: leaderId })
      }
      leaderStats.get(name)!.count++
    }

    const totalDecks = parseInt(summary?.total_decks || '0')

    // Enrich and format
    const leaders = Array.from(leaderStats.values())
      .map(stat => {
        // Normalized: chosen / pools that had the leader available (clamped to
        // 100). Else: chosen / all decks. Falls back to all-decks if a leader's
        // availability is somehow missing.
        const denom = normalized ? (poolsAvailableByName.get(stat.cardName) || totalDecks) : totalDecks
        const selectionRate = denom > 0
          ? Math.min(100, (stat.count / denom) * 100)
          : 0

        const cardData = cardMap.get(stat.cardId) || cardMap.get(stat.cardId?.replace(/-/g, '_'))

        return {
          cardName: stat.cardName,
          cardId: stat.cardId,
          timesSelected: stat.count,
          selectionRate: Math.round(selectionRate * 10) / 10,
          rarity: cardData?.rarity || null,
          aspects: cardData?.aspects || [],
          subtitle: cardData?.subtitle || null,
          imageUrl: cardData?.imageUrl || null,
          backImageUrl: cardData?.backImageUrl || null,
        }
      })
      .sort((a, b) => b.timesSelected - a.timesSelected)

    const response = jsonResponse({
      setCode,
      totalDecks,
      leaders,
    })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
