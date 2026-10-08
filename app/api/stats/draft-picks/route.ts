// @ts-nocheck
// GET /api/stats/draft-picks - Get draft pick analytics per card
import { queryRows, queryRow } from '@/lib/db'
import { requireFullStatsAccess } from '@/lib/auth'
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

    // Locked cohorts (Competitive / Top Players) are patron/admin-only. Gate
    // server-side at the definition layer so the values never reach a
    // non-entitled client — not even via a direct API call. You/All are public.
    if (tournamentOnly || topPlayersOnly) {
      await requireFullStatsAccess(request)
    }

    // Build card lookup maps — all variants merge to same card via name|type key
    // See src/utils/cardNormalization.ts for the canonical normalization pattern
    const allCards = getAllCards()
    const { cardMap } = buildCardLookupMaps(allCards)

    // Bots are NEVER counted in stats — always exclude their picks.
    const botJoin = `JOIN pod_players dpp ON dp.pod_id = dpp.pod_id AND dp.user_id = dpp.user_id`
    const botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`

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
    // Only count picks from completed drafts. Cached in-process (5 min): these
    // are heavy all-time scans the /me Meta tab requests repeatedly.
    const { cardStats, summary } = await cachedAggregate(
      `draft-picks:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      async () => {
        const [cardStats, summary] = await Promise.all([
          queryRows(
      // Group by card_id (keeps each printing separate); the JS pass below
      // re-aggregates by name+subtitle so a card's variants merge but two
      // genuinely-distinct same-name cards stay apart. SUM(pick_in_pack) (not
      // AVG) so positions can be combined across a card's printings.
      `SELECT
        dp.card_id,
        MIN(dp.card_name) AS card_name,
        MIN(dp.rarity) AS rarity,
        MIN(dp.card_type) AS card_type,
        COUNT(*) AS times_picked,
        COUNT(*) FILTER (WHERE dp.pick_in_pack = 1) AS first_picks,
        COUNT(*) FILTER (WHERE dp.pack_number = 1 AND dp.pick_in_pack = 1) AS p1p1_picks,
        SUM(dp.pick_in_pack) AS sum_pick_position,
        COUNT(DISTINCT dp.pod_id) AS drafts_seen_in
      FROM draft_picks dp
      JOIN pods pod ON pod.id = dp.pod_id
      ${botJoin}
      ${builtDeckJoin}
      ${topPlayersJoin}
      WHERE ($1 = 'all' OR dp.set_code = $1) AND dp.is_leader = ${type === 'leaders' ? 'TRUE' : 'FALSE'} AND dp.picked_at >= $2 AND dp.picked_at < ($3::date + interval '1 day')
        AND pod.status = 'complete'
        ${botFilter}
        ${tournamentFilter}

        ${userFilter}
      GROUP BY dp.card_id`,
      queryParams
          ),
          queryRow(
      `SELECT
        COUNT(*) AS total_picks,
        COUNT(DISTINCT dp.pod_id) AS total_drafts,
        COUNT(DISTINCT dp.user_id) AS total_drafters
      FROM draft_picks dp
      JOIN pods pod ON pod.id = dp.pod_id
      ${botJoin}
      ${builtDeckJoin}
      ${topPlayersJoin}
      WHERE ($1 = 'all' OR dp.set_code = $1) AND dp.is_leader = ${type === 'leaders' ? 'TRUE' : 'FALSE'} AND dp.picked_at >= $2 AND dp.picked_at < ($3::date + interval '1 day')
        AND pod.status = 'complete'
        ${botFilter}
        ${tournamentFilter}
        ${loggedInFilter}
        ${userFilter}`,
      queryParams
          ),
        ])
        return { cardStats, summary }
      },
    )

    // Re-aggregate per-card_id rows by gameplay identity = name + subtitle.
    // A card's printings (normal/hyperspace/foil) carry distinct card_ids but
    // the same name+subtitle, so they merge here; two different cards that share
    // a name (different subtitles) stay separate — the name alone is ambiguous.
    // dp.is_leader is unreliable for same-name cards (e.g. LAW has both a Han Solo
    // LEADER "I Got a Really Good Feeling" and a Han Solo UNIT "Hibernation Sick").
    // Split by the card's ACTUAL type — from card data, falling back to the pick's
    // recorded card_type — so the leaders list is only leaders and the cards list
    // never includes a leader.
    const wantLeader = type === 'leaders'
    const byIdentity = new Map<string, any>()
    for (const row of cardStats) {
      const cardData = cardMap.get(row.card_id)
      const resolvedType = cardData?.type || row.card_type
      const isLeaderCard = resolvedType === 'Leader'
      if (isLeaderCard !== wantLeader) continue
      const name = row.card_name
      const subtitle = cardData?.subtitle ?? null
      const key = `${(name || '').toLowerCase()}|${(subtitle || '').toLowerCase()}`
      let agg = byIdentity.get(key)
      if (!agg) {
        agg = {
          cardName: name, cardId: row.card_id, rarity: row.rarity, cardType: row.card_type,
          timesPicked: 0, firstPicks: 0, p1p1Picks: 0, sumPickPosition: 0, draftsSeenIn: 0,
          aspects: cardData?.aspects || [], subtitle,
          cost: cardData?.cost ?? null, imageUrl: cardData?.imageUrl || null, backImageUrl: cardData?.backImageUrl || null,
        }
        byIdentity.set(key, agg)
      }
      agg.timesPicked += parseInt(row.times_picked)
      agg.firstPicks += parseInt(row.first_picks)
      agg.p1p1Picks += parseInt(row.p1p1_picks || '0')
      agg.sumPickPosition += parseFloat(row.sum_pick_position || '0')
      agg.draftsSeenIn += parseInt(row.drafts_seen_in)
      // Prefer the printing that resolved real card art/metadata.
      if (!agg.imageUrl && cardData?.imageUrl) {
        agg.imageUrl = cardData.imageUrl
        agg.backImageUrl = cardData.backImageUrl || agg.backImageUrl
        agg.aspects = cardData.aspects || agg.aspects
        agg.cost = cardData.cost ?? agg.cost
      }
    }

    const cards = Array.from(byIdentity.values())
      .map(a => ({
        cardName: a.cardName,
        cardId: a.cardId,
        rarity: a.rarity,
        cardType: a.cardType,
        timesPicked: a.timesPicked,
        firstPicks: a.firstPicks,
        firstPickPct: a.timesPicked > 0 ? Math.round((a.firstPicks / a.timesPicked) * 1000) / 10 : null,
        p1p1Picks: a.p1p1Picks,
        p1p1Pct: a.timesPicked > 0 ? Math.round((a.p1p1Picks / a.timesPicked) * 1000) / 10 : null,
        avgPickPosition: a.timesPicked > 0 ? Math.round((a.sumPickPosition / a.timesPicked) * 100) / 100 : 0,
        draftsSeenIn: a.draftsSeenIn,
        aspects: a.aspects,
        subtitle: a.subtitle,
        cost: a.cost,
        imageUrl: a.imageUrl,
        backImageUrl: a.backImageUrl,
      }))
      .sort((x, y) => x.avgPickPosition - y.avgPickPosition)

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
