// GET /api/stats/deck/:shareId/gameplay - ShareId-open per-deck gameplay stats.
import { queryRow, queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import {
  buildGameplayResponse,
  type GameplayResponse,
} from '@/app/api/stats/me/gameplay/route'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

function toInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

function replayKey(replay: any): string {
  return replay.wayfinderMatchId || replay.replayUrl || replay.id
}

function dedupeReplays(replays: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const replay of replays) {
    const key = replayKey(replay)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(replay)
  }
  return out
}

export function buildDeckGameplayResponse(
  poolRow: any,
  competitiveRows: any[] = [],
  casualRows: any[] = [],
): GameplayResponse & {
  deck: {
    shareId: string
    poolId: string
    ownerId: string | null
    podId: string | null
    recordIsBuildExact: true
    competitiveAttribution: 'pod' | 'none'
  }
} {
  const wins = toInt(poolRow.wins)
  const losses = toInt(poolRow.losses)
  const draws = toInt(poolRow.draws)
  const ownerId = poolRow.user_id || null
  const capturedMatches = toInt(poolRow.captured_matches)

  const response = buildGameplayResponse(
    {
      wins,
      losses,
      draws,
      pools: wins + losses + draws > 0 ? 1 : 0,
      captured_matches: capturedMatches,
      decks_played: 1,
    },
    [],
    [],
    [{
      share_id: poolRow.share_id,
      name: poolRow.name,
      set_code: poolRow.set_code,
      pool_type: poolRow.pool_type,
      deck_builder_state: poolRow.deck_builder_state,
      wins,
      losses,
      draws,
      captured_matches: capturedMatches,
      updated_at: poolRow.updated_at,
    }],
    { replays_recorded: competitiveRows.length + casualRows.length },
    competitiveRows,
    ownerId || '',
    [{
      deck_builder_state: poolRow.deck_builder_state,
      wins,
      losses,
      draws,
    }],
    casualRows,
  )

  return {
    ...response,
    replays: dedupeReplays(response.replays),
    deck: {
      shareId: poolRow.share_id,
      poolId: poolRow.id,
      ownerId,
      podId: poolRow.pod_id || null,
      recordIsBuildExact: true,
      competitiveAttribution: poolRow.pod_id && ownerId ? 'pod' : 'none',
    },
  }
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const { shareId } = await params
    const pool = await queryRow(
      `SELECT
         cp.id,
         cp.user_id,
         cp.share_id,
         cp.name,
         cp.set_code,
         cp.pool_type,
         cp.deck_builder_state,
         cp.pod_id,
         cp.wins,
         cp.losses,
         cp.draws,
         COALESCE(cardinality(cp.wayfinder_match_ids), 0) AS captured_matches,
         cp.updated_at
       FROM card_pools cp
       WHERE cp.share_id = $1`,
      [shareId],
    )

    if (!pool) {
      return errorResponse('Pool not found', 404) as unknown as NextResponse
    }

    let competitiveRows: any[] = []
    let casualRows: any[] = []

    if (pool.user_id) {
      casualRows = await queryRows(
        `SELECT
           cm.id,
           cm.wayfinder_match_id,
           cm.wayfinder_replay_url,
           cm.result,
           cm.game1_result,
           cm.game2_result,
           cm.game3_result,
           cm.opponent_name,
           cm.player_archetype,
           cm.player_leader,
           cm.opponent_leader,
           cm.opponent_leader_image,
           cm.opponent_base,
           cm.opponent_archetype,
           cm.played_at,
           cp.share_id AS pool_share_id,
           cp.name AS pool_name,
           cp.set_code,
           cp.pool_type,
           cp.deck_builder_state
         FROM casual_matches cm
         JOIN card_pools cp ON cp.id = cm.card_pool_id
         WHERE cm.card_pool_id = $1
           AND cm.user_id = $2
           AND cm.wayfinder_replay_url IS NOT NULL
         ORDER BY cm.played_at DESC
         LIMIT 50`,
        [pool.id, pool.user_id],
      )

      if (pool.pod_id) {
        competitiveRows = await queryRows(
          `SELECT
             pm.id AS match_id,
             pm.wayfinder_match_id,
             pm.wayfinder_replay_url,
             pm.created_at,
             pm.match_winner,
             pm.game1_result,
             pm.game2_result,
             pm.game3_result,
             pm.player1_id,
             pm.player2_id,
             CASE WHEN pm.player1_id = $2 THEN u2.username ELSE u1.username END AS opponent_username,
             CASE WHEN pm.player1_id = $2 THEN u2.avatar_url ELSE u1.avatar_url END AS opponent_avatar_url,
             CASE WHEN pm.player1_id = $2 THEN pm.player2_leader ELSE pm.player1_leader END AS opponent_leader,
             CASE WHEN pm.player1_id = $2 THEN pm.player2_leader_image ELSE pm.player1_leader_image END AS opponent_leader_image,
             CASE WHEN pm.player1_id = $2 THEN pm.player2_base ELSE pm.player1_base END AS opponent_base,
             CASE WHEN pm.player1_id = $2 THEN pm.player2_archetype ELSE pm.player1_archetype END AS opponent_archetype,
             CASE WHEN pm.player1_id = $2 THEN pm.player1_archetype ELSE pm.player2_archetype END AS my_archetype,
             CASE WHEN pm.player1_id = $2 THEN pm.player1_leader ELSE pm.player2_leader END AS my_leader,
             cp.share_id AS pool_share_id,
             cp.name AS pool_name,
             cp.set_code,
             cp.pool_type,
             cp.deck_builder_state
           FROM practice_matches pm
           JOIN card_pools cp ON cp.id = $1
           LEFT JOIN users u1 ON u1.id = pm.player1_id
           LEFT JOIN users u2 ON u2.id = pm.player2_id
           WHERE pm.pod_id = cp.pod_id
             AND (pm.player1_id = $2 OR pm.player2_id = $2)
             AND pm.wayfinder_replay_url IS NOT NULL
           ORDER BY pm.created_at DESC
           LIMIT 50`,
          [pool.id, pool.user_id],
        )
      }
    }

    const response = jsonResponse(buildDeckGameplayResponse(pool, competitiveRows, casualRows))
    response.headers.set('Cache-Control', 'public, max-age=60')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
