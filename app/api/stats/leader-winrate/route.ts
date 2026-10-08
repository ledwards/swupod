// @ts-nocheck
// GET /api/stats/leader-winrate?setCode=LAW — META-WIDE win rate by leader.
//
// The whole site's captured-game record, aggregated per leader (with the per-
// base-aspect split), so the /me Meta tab can show "Win rate by leader" across
// all players — distinct from the personal /me/gameplay version on the Gameplay
// tab. Bots are never counted (their pods have a pod_players.is_bot row; bots
// don't play captured games anyway). Heavy JSONB scan, so it's cached.
import { queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { buildLeaderBreakdown } from '@/app/api/stats/me/gameplay/route'
import { getCardsBySet, getLeaders } from '@/src/utils/cardData'
import { NextRequest, NextResponse } from 'next/server'

const SET_CODE_RE = /^[A-Z]{3}(?:-CB)?$/

// Pad the breakdown with EVERY leader printed in the set, so the Meta grid shows
// the whole roster — a leader with no captured games yet renders as "–" instead
// of vanishing. Keyed by card.name (the same display name buildLeaderBreakdown
// uses), so a leader that already has games is never duplicated. Skipped for
// 'all' (no single card pool to enumerate).
function fillSetLeaderRoster(
  breakdown: ReturnType<typeof buildLeaderBreakdown>,
  setCode: string,
): ReturnType<typeof buildLeaderBreakdown> {
  const baseCode = setCode.replace(/-CB$/, '')
  const have = new Set(breakdown.map((e) => e.leaderName))
  const extras = []
  for (const card of getLeaders(getCardsBySet(baseCode))) {
    const name = card?.name
    if (!name || have.has(name)) continue
    if (card.isPlaceholder) continue
    // One row per leader: skip foil/hyperspace/showcase reprints.
    if (card.variantType && card.variantType !== 'Normal') continue
    have.add(name)
    extras.push({
      leaderName: name,
      leaderImageUrl: card.imageUrl || null,
      leaderBackImageUrl: card.backImageUrl || null,
      baseColor: null,
      wins: 0, losses: 0, draws: 0, matches: 0, winRate: 0, pools: 0,
      byBase: [],
    })
  }
  return extras.length ? [...breakdown, ...extras] : breakdown
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = (url.searchParams.get('setCode') || '').trim()
    // 'all' = combine every set; otherwise must be a valid set code.
    if (setCode !== 'all' && !SET_CODE_RE.test(setCode)) {
      return errorResponse('Invalid or missing setCode', 400) as unknown as NextResponse
    }
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'

    const rows = await cachedAggregate(
      `leader-winrate:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      () => queryRows(
        `SELECT cp.deck_builder_state, cp.wins, cp.losses, cp.draws
         FROM card_pools cp
         LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
         WHERE ($1 = 'all' OR cp.set_code = $1)
           AND cp.updated_at >= $2 AND cp.updated_at < ($3::date + interval '1 day')
           AND (cp.wins + cp.losses + cp.draws > 0)
           AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`,
        [setCode, since, until],
      ),
    )

    const leaderBreakdown = setCode === 'all'
      ? buildLeaderBreakdown(rows)
      : fillSetLeaderRoster(buildLeaderBreakdown(rows), setCode)
    const response = jsonResponse({ setCode, leaderBreakdown })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
