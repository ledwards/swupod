// @ts-nocheck
// GET /api/stats/archetype-selection - prevalence of leader+base ARCHETYPES in
// built decks. Mirrors leader-selection but groups by the (leader, base) combo
// and names it via the swuapi archetype resolver (the canonical "Splash Red"
// nickname); only when swuapi is unavailable does it fall back to the local
// "Leader Color HP" name — never a hand-rolled "Leader / Base" slash.
// poolType=sealed|draft splits the field.
import { queryRows } from '@/lib/db'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps } from '@/src/utils/cardNormalization'
import { archetypeShortName } from '@/src/utils/archetypeName'
import { NextRequest, NextResponse } from 'next/server'

const SWUAPI_URL = process.env['SWUAPI_URL'] || 'https://api.swuapi.com'

// Resolve a card's swuapi UUID — its own id when that's a UUID, else by set:number.
// Mirrors app/api/pools/[shareId]/builds/route.ts so both name archetypes the same.
let leaderUuidIndex: Map<string, string> | null = null
let baseUuidIndex: Map<string, string> | null = null
function buildIndexes(): void {
  if (leaderUuidIndex && baseUuidIndex) return
  leaderUuidIndex = new Map()
  baseUuidIndex = new Map()
  for (const card of getAllCards()) {
    if (!card.id || !card.set || card.number == null) continue
    const key = `${card.set}:${String(card.number)}`
    if (card.isLeader || card.type === 'Leader') { if (!leaderUuidIndex.has(key)) leaderUuidIndex.set(key, card.id) }
    if (card.isBase || card.type === 'Base') { if (!baseUuidIndex.has(key)) baseUuidIndex.set(key, card.id) }
  }
}
function resolveUuid(card: any, kind: 'leader' | 'base'): string | null {
  if (!card) return null
  if (typeof card.id === 'string' && card.id.includes('-')) return card.id
  buildIndexes()
  if (card.set && card.number != null) {
    const key = `${card.set}:${String(card.number)}`
    return (kind === 'leader' ? leaderUuidIndex : baseUuidIndex)?.get(key) || null
  }
  return null
}
async function resolveArchetypeNickname(leaderUuid: string, baseUuid: string, cache: Map<string, string | null>): Promise<string | null> {
  const key = `${leaderUuid}:${baseUuid}`
  if (cache.has(key)) return cache.get(key)!
  try {
    const res = await fetch(`${SWUAPI_URL}/archetypes/resolve?leader_card_uuid=${leaderUuid}&base_card_uuid=${baseUuid}&format=Limited`)
    if (!res.ok) { cache.set(key, null); return null }
    const data = await res.json()
    const nickname = data?.nickname || null
    cache.set(key, nickname)
    return nickname
  } catch {
    cache.set(key, null)
    return null
  }
}

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

    // Whole computation (query + nickname resolution + aggregation) is cached for
    // 5 min — the swuapi nickname lookups are network calls we don't want to repeat.
    const { archetypes, totalDecks } = await cachedAggregate(
      `archetype-selection:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      async () => {
        // Bots are NEVER counted — exclude bot drafters' decks.
        const rows = await queryRows(
          `SELECT bd.leader, bd.base
           FROM built_decks bd
           LEFT JOIN card_pools cp ON cp.id = bd.card_pool_id
           LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND bd.user_id = dpp.user_id
           WHERE ($1 = 'all' OR bd.set_code = $1) AND bd.built_at >= $2 AND bd.built_at < ($3::date + interval '1 day')
             AND (dpp.is_bot = false OR dpp.is_bot IS NULL)
             ${poolTypeFilter}`,
          queryParams,
        )

        const stats = new Map<string, {
          count: number; name: string; leaderName: string; aspects: string[]
          leaderImageUrl: string | null; leaderBackImageUrl: string | null
        }>()
        const nicknameCache = new Map<string, string | null>()
        let totalDecks = 0

        for (const row of rows) {
          const leader = row.leader
          const base = row.base
          if (!leader) continue

          // An archetype is leader + base. Only count decks that resolve to BOTH a
          // real Leader card AND a real Base card; skip rows with a null/foreign base.
          const leaderData = cardMap.get(leader.id || leader.cardId || '')
          if (!leaderData || leaderData.type !== 'Leader') continue
          const baseData = base ? cardMap.get(base.id || base.cardId || '') : null
          if (!baseData || baseData.type !== 'Base') continue

          const leaderName = leaderData.name || leader.name || leader.cardName || 'Unknown'

          // Canonical swuapi nickname ("Splash Red"); fall back to the local
          // "Leader Color HP" only when swuapi can't resolve the combo.
          const leaderUuid = resolveUuid(leader, 'leader')
          const baseUuid = resolveUuid(base, 'base')
          const archetypeNickname = (leaderUuid && baseUuid)
            ? await resolveArchetypeNickname(leaderUuid, baseUuid, nicknameCache)
            : null

          const name = archetypeShortName({
            archetypeNickname,
            leaderName,
            baseAspects: baseData.aspects || [],
            baseHp: baseData.hp ?? null,
            baseName: baseData.name ?? null,
            baseRarity: baseData.rarity ?? null,
          })
          if (!name) continue

          totalDecks++
          if (!stats.has(name)) {
            stats.set(name, {
              count: 0,
              name,
              leaderName,
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

        return { archetypes, totalDecks }
      },
    )

    const response = jsonResponse({ setCode, totalDecks, archetypes })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
