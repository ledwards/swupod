// @ts-nocheck
// GET /api/stats/leader-openings - Contextual leader pick stats: which leaders
// are taken OVER which, inside the same opening (fresh 3-leader) pack.
//
// Reads pods.all_leader_packs (the original per-seat leader packs, snapshotted at
// draft start / backfilled by migration 077) + the round-1 leader pick from
// draft_picks. Each (pod, seat) is one opening: openingLeaders = that seat's pack,
// firstPick = the leader that seat's owner took first. computeLeaderContextStats
// aggregates per-leader first-pick rate and pairwise head-to-heads.
import { queryRows } from '@/lib/db'
import { requireFullStatsAccess } from '@/lib/auth'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps } from '@/src/utils/cardNormalization'
import { computeLeaderContextStats } from '@/src/services/leaderPickContext'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'
    const tournamentOnly = url.searchParams.get('tournamentOnly') === 'true'
    const topPlayersOnly = url.searchParams.get('topPlayersOnly') === 'true'
    const userId = url.searchParams.get('userId') || null

    // Locked cohorts are patron/admin-only — gate server-side (see draft-picks).
    if (tournamentOnly || topPlayersOnly) {
      await requireFullStatsAccess(request)
    }

    const allCards = getAllCards()
    const { cardMap } = buildCardLookupMaps(allCards)

    // Bots never count — measure only human pick preference.
    const botFilter = `AND (pp.is_bot = false OR pp.is_bot IS NULL)`

    const queryParams: (string | string[])[] = [setCode, since, until]
    let tournamentFilter = ''
    if (tournamentOnly) {
      queryParams.push(tournamentUserIds)
      tournamentFilter = `AND dp.user_id = ANY($${queryParams.length}::uuid[])`
    }
    let topPlayersJoin = ''
    if (topPlayersOnly) {
      topPlayersJoin = `JOIN top_players tp ON tp.user_id = dp.user_id`
    }
    let userFilter = ''
    if (userId) {
      queryParams.push(userId)
      userFilter = `AND dp.user_id = $${queryParams.length}::uuid`
    }

    const rows = await cachedAggregate(
      `leader-openings:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      async () =>
        // One row per round-1 human leader pick, carrying its seat's opening pack.
        queryRows(
          `SELECT dp.pod_id, dp.card_id, dp.card_name, pp.seat_number, p.all_leader_packs
           FROM draft_picks dp
           JOIN pods p ON p.id = dp.pod_id
           JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
           ${topPlayersJoin}
           WHERE dp.is_leader = TRUE AND dp.leader_round = 1
             AND ($1 = 'all' OR dp.set_code = $1)
             AND dp.picked_at >= $2 AND dp.picked_at < ($3::date + interval '1 day')
             AND p.status = 'complete'
             AND p.all_leader_packs IS NOT NULL
             ${botFilter}
             ${tournamentFilter}
             ${userFilter}`,
          queryParams
        ),
    )

    // Resolve a leader card object to its canonical NAME (variants collapse).
    const nameOf = (leaderLike: any): string | null => {
      if (!leaderLike) return null
      const id = leaderLike.id || leaderLike.cardId || leaderLike.card_id
      return cardMap.get(id)?.name || leaderLike.name || leaderLike.cardName || null
    }

    // Build one opening per pick row: the seat's pack + the leader it took first.
    const openings: { openingLeaders: string[]; firstPick: string | null }[] = []
    for (const row of rows) {
      const packs = typeof row.all_leader_packs === 'string'
        ? JSON.parse(row.all_leader_packs)
        : row.all_leader_packs
      if (!Array.isArray(packs)) continue
      const seatIdx = (row.seat_number ?? 0) - 1
      const pack = packs[seatIdx]
      if (!Array.isArray(pack) || pack.length === 0) continue

      const openingLeaders = pack.map(nameOf).filter(Boolean) as string[]
      if (openingLeaders.length === 0) continue
      const firstPick = cardMap.get(row.card_id)?.name || row.card_name || null
      openings.push({ openingLeaders, firstPick })
    }

    const stats = computeLeaderContextStats(openings)

    // Enrich each leader with display metadata for the UI.
    const leaders = stats.map(s => {
      const card = cardMap.get(s.leader) || allCards.find(c => c.name === s.leader && c.type === 'Leader')
      return {
        leader: s.leader,
        openings: s.openings,
        firstPicks: s.firstPicks,
        firstPickPct: s.openings > 0 ? Math.round(s.firstPickRate * 1000) / 10 : null,
        rivals: s.rivals.map(r => ({
          rival: r.rival,
          coOpenings: r.coOpenings,
          pickedOver: r.pickedOver,
          pickedUnder: r.pickedUnder,
          chosenOverPct: r.chosenOverRate === null ? null : Math.round(r.chosenOverRate * 1000) / 10,
        })),
        aspects: card?.aspects || [],
        subtitle: card?.subtitle || null,
        imageUrl: card?.imageUrl || null,
        backImageUrl: card?.backImageUrl || null,
      }
    })

    const response = jsonResponse({ setCode, totalOpenings: openings.length, leaders })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
