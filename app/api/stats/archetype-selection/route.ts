// @ts-nocheck
// GET /api/stats/archetype-selection - prevalence of leader+base ARCHETYPES in
// built decks. Mirrors leader-selection but groups by the (leader, base) combo
// and names it via archetypeShortName (swuapi nickname when present, else the
// canonical "Leader Color HP" fallback — never a hand-rolled "Leader / Base"
// slash). poolType=sealed|draft splits the field.
import { queryRows } from '@/lib/db'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps } from '@/src/utils/cardNormalization'
import { archetypeShortName } from '@/src/utils/archetypeName'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'
    const poolType = url.searchParams.get('poolType') || null

    const { cardMap } = buildCardLookupMaps(getAllCards())

    const poolTypeFilter = poolType ? `AND bd.pool_type = $4` : ''
    const queryParams: string[] = poolType ? [setCode, since, until, poolType] : [setCode, since, until]

    const rows = await cachedAggregate(
      `archetype-selection:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      () => queryRows(
        // Bots are NEVER counted — exclude bot drafters' decks (draft pods have
        // a pod_players row with is_bot=true; sealed pools have none → human).
        `SELECT bd.leader, bd.base
         FROM built_decks bd
         LEFT JOIN card_pools cp ON cp.id = bd.card_pool_id
         LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND bd.user_id = dpp.user_id
         WHERE bd.set_code = $1 AND bd.built_at >= $2 AND bd.built_at < ($3::date + interval '1 day')
           AND (dpp.is_bot = false OR dpp.is_bot IS NULL)
           ${poolTypeFilter}`,
        queryParams,
      ),
    )

    // Aggregate by archetype identity (leader + base color + base HP).
    const stats = new Map<string, {
      count: number
      name: string
      leaderName: string
      aspects: string[]
      leaderImageUrl: string | null
      leaderBackImageUrl: string | null
    }>()
    let totalDecks = 0

    for (const row of rows) {
      const leader = row.leader
      const base = row.base
      if (!leader) continue

      // An archetype is leader + base. Only count decks that resolve to BOTH a
      // real Leader card AND a real Base card. Some built_decks rows have a base
      // JSONB that is null, lacks an id/cardId, or points at a card not in the
      // set's card data — those would otherwise fall back to a bare leader name
      // ("Hera Syndulla" with no base), which is not a valid archetype. Skip them.
      const leaderData = cardMap.get(leader.id || leader.cardId || '')
      if (!leaderData || leaderData.type !== 'Leader') continue
      const baseData = base ? cardMap.get(base.id || base.cardId || '') : null
      if (!baseData || baseData.type !== 'Base') continue

      const leaderName = leaderData.name || leader.name || leader.cardName || 'Unknown'
      const baseAspects = baseData.aspects || []
      const baseHp = baseData.hp ?? null
      const baseName = baseData.name ?? null
      const baseRarity = baseData.rarity ?? null
      const name = archetypeShortName({ leaderName, baseAspects, baseHp, baseName, baseRarity })
      if (!name) continue

      totalDecks++
      if (!stats.has(name)) {
        stats.set(name, {
          count: 0,
          name,
          leaderName,
          // Aspect color for the bar comes from the leader's aspects.
          aspects: leaderData?.aspects || leader.aspects || [],
          leaderImageUrl: leaderData?.imageUrl || null,
          leaderBackImageUrl: leaderData?.backImageUrl || null,
        })
      }
      stats.get(name)!.count++
    }

    const archetypes = Array.from(stats.values())
      .map((s) => ({
        cardName: s.name,
        leaderName: s.leaderName,
        timesSelected: s.count,
        selectionRate: totalDecks > 0 ? Math.round((s.count / totalDecks) * 1000) / 10 : 0,
        aspects: s.aspects,
        imageUrl: s.leaderImageUrl,
        backImageUrl: s.leaderBackImageUrl,
      }))
      .sort((a, b) => b.timesSelected - a.timesSelected)

    const response = jsonResponse({ setCode, totalDecks, archetypes })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
