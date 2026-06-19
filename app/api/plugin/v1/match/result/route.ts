// app/api/plugin/v1/match/result/route.ts
// @ts-nocheck
// POST /api/plugin/v1/match/result
// Server-to-server: Wayfinder calls this to record a game or match result.
// For competitive pods: called per-game with gameNumber (1/2/3)
// For other pools: called once per match with overall result
// Auth: Authorization: Bearer <PTP_SERVICE_KEY>
import { query, queryRow } from '@/lib/db'
import { requireServiceKey } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import {
  PracticeGameResultError,
  recordPracticeMatchGameResult,
} from '@/src/services/matchmaking/liveGames'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireServiceKey(request)

    const body = await request.json()
    const {
      poolShareId, result, matchId, gameNumber, replayUrl, practiceMatchGameId, wayfinderGameId,
      // Optional captured deck identities (Wayfinder Companion ≥ identity build).
      // "player*" is the reporting player's deck; "opponent*" is the other side.
      // See docs/WAYFINDER_PLUGIN_MATCH_IDENTITY.md.
      playerLeader, playerLeaderImage, playerBase, playerBaseImage, playerArchetype,
      opponentLeader, opponentLeaderImage, opponentBase, opponentBaseImage, opponentArchetype,
    } = body

    if (!poolShareId || !result || !matchId) {
      return errorResponse('poolShareId, result, and matchId are required', 400)
    }
    if (!['win', 'loss', 'draw'].includes(result)) {
      return errorResponse('result must be win, loss, or draw', 400)
    }
    if (gameNumber !== undefined && ![1, 2, 3].includes(gameNumber)) {
      return errorResponse('gameNumber must be 1, 2, or 3', 400)
    }

    const pool = await queryRow(
      'SELECT id FROM card_pools WHERE share_id = $1',
      [poolShareId]
    )
    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    // Check if this pool belongs to a competitive pod
    const poolWithPod = await queryRow(
      `SELECT cp.user_id, p.id as pod_id, p.share_id as pod_share_id, p.competitive
       FROM card_pools cp
       JOIN pods p ON cp.pod_id = p.id
       WHERE cp.share_id = $1`,
      [poolShareId]
    )

    if (poolWithPod?.competitive) {
      const recorded = await recordPracticeMatchGameResult({
        poolShareId,
        wayfinderMatchId: matchId,
        result,
        practiceMatchGameId: practiceMatchGameId ?? null,
        gameNumber: gameNumber ?? null,
        replayUrl: replayUrl ?? null,
        wayfinderGameId: wayfinderGameId ?? null,
        playerLeader: playerLeader ?? null,
        playerLeaderImage: playerLeaderImage ?? null,
        playerBase: playerBase ?? null,
        playerBaseImage: playerBaseImage ?? null,
        playerArchetype: playerArchetype ?? null,
        opponentLeader: opponentLeader ?? null,
        opponentLeaderImage: opponentLeaderImage ?? null,
        opponentBase: opponentBase ?? null,
        opponentBaseImage: opponentBaseImage ?? null,
        opponentArchetype: opponentArchetype ?? null,
      })

      if (recorded.changed) {
        await broadcastDraftState(recorded.shareId)
      }

      return jsonResponse({ ok: true, competitive: true, duplicate: recorded.duplicate })
    } else {
      // NON-COMPETITIVE: update card_pools directly with overall match result
      const winDelta = result === 'win' ? 1 : 0
      const lossDelta = result === 'loss' ? 1 : 0
      const drawDelta = result === 'draw' ? 1 : 0

      await query(
        `UPDATE card_pools
         SET wins = wins + $1,
             losses = losses + $2,
             draws = draws + $3,
             wayfinder_match_ids = array_append(wayfinder_match_ids, $4),
             updated_at = NOW()
         WHERE share_id = $5`,
        [winDelta, lossDelta, drawDelta, matchId, poolShareId]
      )

      // Also log the match so it appears in the personal gameplay history
      // (casual games have no practice_matches row). Idempotent per
      // (user, match) so a re-report updates rather than duplicates.
      const owner = await queryRow('SELECT user_id FROM card_pools WHERE share_id = $1', [poolShareId])
      if (owner?.user_id) {
        await query(
          `INSERT INTO casual_matches (
             user_id, card_pool_id, wayfinder_match_id, wayfinder_replay_url, result,
             opponent_name,
             player_leader, player_leader_image, player_base, player_archetype,
             opponent_leader, opponent_leader_image, opponent_base, opponent_archetype
           )
           SELECT $1, cp.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
           FROM card_pools cp WHERE cp.share_id = $14
           ON CONFLICT (user_id, wayfinder_match_id) WHERE wayfinder_match_id IS NOT NULL
           DO UPDATE SET
             wayfinder_replay_url = COALESCE(EXCLUDED.wayfinder_replay_url, casual_matches.wayfinder_replay_url),
             result = EXCLUDED.result,
             opponent_name = COALESCE(EXCLUDED.opponent_name, casual_matches.opponent_name),
             player_leader = COALESCE(EXCLUDED.player_leader, casual_matches.player_leader),
             player_leader_image = COALESCE(EXCLUDED.player_leader_image, casual_matches.player_leader_image),
             player_base = COALESCE(EXCLUDED.player_base, casual_matches.player_base),
             player_archetype = COALESCE(EXCLUDED.player_archetype, casual_matches.player_archetype),
             opponent_leader = COALESCE(EXCLUDED.opponent_leader, casual_matches.opponent_leader),
             opponent_leader_image = COALESCE(EXCLUDED.opponent_leader_image, casual_matches.opponent_leader_image),
             opponent_base = COALESCE(EXCLUDED.opponent_base, casual_matches.opponent_base),
             opponent_archetype = COALESCE(EXCLUDED.opponent_archetype, casual_matches.opponent_archetype)`,
          [
            owner.user_id, matchId, replayUrl ?? null, result,
            body.opponentName ?? null,
            playerLeader ?? null, playerLeaderImage ?? null, playerBase ?? null, playerArchetype ?? null,
            opponentLeader ?? null, opponentLeaderImage ?? null, opponentBase ?? null, opponentArchetype ?? null,
            poolShareId,
          ]
        )
      }
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof PracticeGameResultError) {
      return errorResponse(error.message, error.status)
    }

    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }
    return handleApiError(error)
  }
}
