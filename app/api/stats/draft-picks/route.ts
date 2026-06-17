// @ts-nocheck
// GET /api/stats/draft-picks - Get draft pick analytics per card
import { queryRows, queryRow } from '@/lib/db'
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
    const type = url.searchParams.get('type') || 'cards' // 'cards' or 'leaders'
    const includeBots = url.searchParams.get('includeBots') === 'true'
    const includeHumans = url.searchParams.get('includeHumans') !== 'false'
    const builtDeckOnly = url.searchParams.get('builtDeckOnly') === 'true'
    const tournamentOnly = url.searchParams.get('tournamentOnly') === 'true'
    const topPlayersOnly = url.searchParams.get('topPlayersOnly') === 'true'
    const userId = url.searchParams.get('userId') || null
    // "Logged-in players" segment: picks made by a signed-in (registered) drafter.
    const loggedInOnly = url.searchParams.get('loggedInOnly') === 'true'
    const loggedInFilter = loggedInOnly ? `AND dp.user_id IS NOT NULL` : ''

    // Build card lookup maps — all variants merge to same card via name|type key
    // See src/utils/cardNormalization.ts for the canonical normalization pattern
    const allCards = getAllCards()
    const { cardMap } = buildCardLookupMaps(allCards)

    // Build bot/human filter
    let botJoin = ''
    let botFilter = ''
    if (!includeBots || !includeHumans) {
      botJoin = `JOIN pod_players dpp ON dp.pod_id = dpp.pod_id AND dp.user_id = dpp.user_id`
      if (!includeBots && includeHumans) {
        botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`
      } else if (includeBots && !includeHumans) {
        botFilter = `AND dpp.is_bot = true`
      }
    }

    // Built deck filter - only include picks from drafters who built a deck
    let builtDeckJoin = ''
    if (builtDeckOnly) {
      builtDeckJoin = `JOIN card_pools cp_bd ON cp_bd.pod_id = dp.pod_id AND cp_bd.user_id = dp.user_id
      JOIN built_decks bd ON bd.card_pool_id = cp_bd.id`
    }

    // Tournament player filter
    let tournamentFilter = ''
    const queryParams: (string | string[])[] = [setCode, since, until]
    if (tournamentOnly) {
      queryParams.push(tournamentUserIds)
      tournamentFilter = `AND dp.user_id = ANY($${queryParams.length}::uuid[])`
    }

    // Top players filter (from top_players table)
    let topPlayersJoin = ''
    if (topPlayersOnly) {
      topPlayersJoin = `JOIN top_players tp ON tp.user_id = dp.user_id`
    }

    // Single user filter
    let userFilter = ''
    if (userId) {
      queryParams.push(userId)
      userFilter = `AND dp.user_id = $${queryParams.length}::uuid`
    }

    // Per-card pick analytics (non-leader cards only, merge variants by card_name)
    // Only count picks from completed drafts
    const cardStats = await queryRows(
      `SELECT
        dp.card_name,
        MIN(dp.card_id) AS card_id,
        dp.rarity,
        dp.card_type,
        COUNT(*) AS times_picked,
        COUNT(*) FILTER (WHERE dp.pick_in_pack = 1) AS first_picks,
        COUNT(*) FILTER (WHERE dp.pack_number = 1 AND dp.pick_in_pack = 1) AS p1p1_picks,
        ROUND(AVG(dp.pick_in_pack)::numeric, 2) AS avg_pick_position,
        COUNT(DISTINCT dp.pod_id) AS drafts_seen_in
      FROM draft_picks dp
      JOIN pods pod ON pod.id = dp.pod_id
      ${botJoin}
      ${builtDeckJoin}
      ${topPlayersJoin}
      WHERE dp.set_code = $1 AND dp.is_leader = ${type === 'leaders' ? 'TRUE' : 'FALSE'} AND dp.picked_at >= $2 AND dp.picked_at < ($3::date + interval '1 day')
        AND pod.status = 'complete'
        ${botFilter}
        ${tournamentFilter}

        ${userFilter}
      GROUP BY dp.card_name, dp.rarity, dp.card_type
      ORDER BY avg_pick_position ASC`,
      queryParams
    )

    // Summary stats (completed drafts only)
    const summary = await queryRow(
      `SELECT
        COUNT(*) AS total_picks,
        COUNT(DISTINCT dp.pod_id) AS total_drafts,
        COUNT(DISTINCT dp.user_id) AS total_drafters
      FROM draft_picks dp
      JOIN pods pod ON pod.id = dp.pod_id
      ${botJoin}
      ${builtDeckJoin}
      ${topPlayersJoin}
      WHERE dp.set_code = $1 AND dp.is_leader = ${type === 'leaders' ? 'TRUE' : 'FALSE'} AND dp.picked_at >= $2 AND dp.picked_at < ($3::date + interval '1 day')
        AND pod.status = 'complete'
        ${botFilter}
        ${tournamentFilter}
        ${loggedInFilter}
        ${userFilter}`,
      queryParams
    )

    // Enrich cards with aspects, subtitle, cost from card cache
    const cards = cardStats.map(row => {
      const timesPicked = parseInt(row.times_picked)
      const firstPicks = parseInt(row.first_picks)
      const p1p1Picks = parseInt(row.p1p1_picks || '0')
      const cardData = cardMap.get(row.card_id)

      return {
        cardName: row.card_name,
        cardId: row.card_id,
        rarity: row.rarity,
        cardType: row.card_type,
        timesPicked,
        firstPicks,
        firstPickPct: timesPicked > 0 ? Math.round((firstPicks / timesPicked) * 1000) / 10 : null,
        p1p1Picks,
        p1p1Pct: timesPicked > 0 ? Math.round((p1p1Picks / timesPicked) * 1000) / 10 : null,
        avgPickPosition: parseFloat(row.avg_pick_position),
        draftsSeenIn: parseInt(row.drafts_seen_in),
        aspects: cardData?.aspects || [],
        subtitle: cardData?.subtitle || null,
        cost: cardData?.cost ?? null,
        imageUrl: cardData?.imageUrl || null,
        backImageUrl: cardData?.backImageUrl || null,
      }
    })

    const response = jsonResponse({
      setCode,
      totalPicks: parseInt(summary?.total_picks || '0'),
      totalDrafts: parseInt(summary?.total_drafts || '0'),
      totalDrafters: parseInt(summary?.total_drafters || '0'),
      cards,
    })
    // Cache stats for 5 minutes — data only changes when new drafts complete
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
