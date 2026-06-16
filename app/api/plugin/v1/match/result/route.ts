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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireServiceKey(request)

    const body = await request.json()
    const {
      poolShareId, result, matchId, gameNumber, replayUrl,
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
      // COMPETITIVE: per-game flow
      // Find active round and practice match for this player
      const activeRound = await queryRow(
        `SELECT id FROM practice_rounds WHERE pod_id = $1 AND status = 'active' ORDER BY round_number DESC LIMIT 1`,
        [poolWithPod.pod_id]
      )

      if (!activeRound) {
        return errorResponse('No active round found', 404)
      }

      const practiceMatch = await queryRow(
        `SELECT id, player1_id, player2_id FROM practice_matches
         WHERE round_id = $1 AND final_confirmed = false AND is_bye = false
           AND (player1_id = $2 OR player2_id = $2)`,
        [activeRound.id, poolWithPod.user_id]
      )

      if (!practiceMatch) {
        return errorResponse('No active practice match found for this player', 404)
      }

      const isPlayer1 = practiceMatch.player1_id === poolWithPod.user_id

      // Map win/loss/draw to player1/player2 perspective
      const gameResult = isPlayer1
        ? (result === 'win' ? 'player1' : result === 'loss' ? 'player2' : 'draw')
        : (result === 'win' ? 'player2' : result === 'loss' ? 'player1' : 'draw')

      // Determine which game column to update
      let gameCol: string
      if (gameNumber) {
        gameCol = `game${gameNumber}_result`
      } else {
        // Fall back to next empty slot
        const currentMatch = await queryRow(`SELECT * FROM practice_matches WHERE id = $1`, [practiceMatch.id])
        gameCol = 'game1_result'
        if (currentMatch.game1_result) gameCol = 'game2_result'
        if (currentMatch.game1_result && currentMatch.game2_result) gameCol = 'game3_result'
      }

      // Map the reporter's deck (player*) and the opponent's deck (opponent*)
      // onto the player1/player2 identity columns for this match. COALESCE so a
      // later game's call never blanks an identity captured on an earlier one.
      const p1 = isPlayer1
        ? { leader: playerLeader, leaderImage: playerLeaderImage, base: playerBase, baseImage: playerBaseImage, archetype: playerArchetype }
        : { leader: opponentLeader, leaderImage: opponentLeaderImage, base: opponentBase, baseImage: opponentBaseImage, archetype: opponentArchetype }
      const p2 = isPlayer1
        ? { leader: opponentLeader, leaderImage: opponentLeaderImage, base: opponentBase, baseImage: opponentBaseImage, archetype: opponentArchetype }
        : { leader: playerLeader, leaderImage: playerLeaderImage, base: playerBase, baseImage: playerBaseImage, archetype: playerArchetype }

      // Update the game slot, wayfinder_match_id, replay URL, and deck identities
      await query(
        `UPDATE practice_matches SET
           ${gameCol} = $2,
           wayfinder_match_id = $3,
           wayfinder_replay_url = COALESCE($4, wayfinder_replay_url),
           player1_leader = COALESCE($5, player1_leader),
           player1_leader_image = COALESCE($6, player1_leader_image),
           player1_base = COALESCE($7, player1_base),
           player1_base_image = COALESCE($8, player1_base_image),
           player1_archetype = COALESCE($9, player1_archetype),
           player2_leader = COALESCE($10, player2_leader),
           player2_leader_image = COALESCE($11, player2_leader_image),
           player2_base = COALESCE($12, player2_base),
           player2_base_image = COALESCE($13, player2_base_image),
           player2_archetype = COALESCE($14, player2_archetype)
         WHERE id = $1`,
        [
          practiceMatch.id, gameResult, matchId, replayUrl ?? null,
          p1.leader ?? null, p1.leaderImage ?? null, p1.base ?? null, p1.baseImage ?? null, p1.archetype ?? null,
          p2.leader ?? null, p2.leaderImage ?? null, p2.base ?? null, p2.baseImage ?? null, p2.archetype ?? null,
        ]
      )

      // Check if match is now decidable
      const updatedMatch = await queryRow(`SELECT * FROM practice_matches WHERE id = $1`, [practiceMatch.id])
      const { deriveMatchWinner } = await import('@/src/services/matchmaking/results')
      const winner = deriveMatchWinner(updatedMatch.game1_result, updatedMatch.game2_result, updatedMatch.game3_result)

      if (winner) {
        // Match is decided — confirm it
        await query(
          `UPDATE practice_matches SET final_confirmed = true, match_winner = $2, player1_submitted = true, player2_submitted = true WHERE id = $1`,
          [practiceMatch.id, winner]
        )

        // Update BOTH players' card_pools with the match-level result
        const player1Pool = await queryRow(
          `SELECT share_id FROM card_pools WHERE user_id = $1 AND pod_id = $2`,
          [practiceMatch.player1_id, poolWithPod.pod_id]
        )
        const player2Pool = await queryRow(
          `SELECT share_id FROM card_pools WHERE user_id = $1 AND pod_id = $2`,
          [practiceMatch.player2_id, poolWithPod.pod_id]
        )

        if (winner === 'player1') {
          // Player 1 wins, player 2 loses
          if (player1Pool) {
            await query(
              `UPDATE card_pools
               SET wins = wins + 1,
                   wayfinder_match_ids = array_append(wayfinder_match_ids, $1),
                   updated_at = NOW()
               WHERE share_id = $2`,
              [matchId, player1Pool.share_id]
            )
          }
          if (player2Pool) {
            await query(
              `UPDATE card_pools
               SET losses = losses + 1,
                   wayfinder_match_ids = array_append(wayfinder_match_ids, $1),
                   updated_at = NOW()
               WHERE share_id = $2`,
              [matchId, player2Pool.share_id]
            )
          }
        } else if (winner === 'player2') {
          // Player 2 wins, player 1 loses
          if (player1Pool) {
            await query(
              `UPDATE card_pools
               SET losses = losses + 1,
                   wayfinder_match_ids = array_append(wayfinder_match_ids, $1),
                   updated_at = NOW()
               WHERE share_id = $2`,
              [matchId, player1Pool.share_id]
            )
          }
          if (player2Pool) {
            await query(
              `UPDATE card_pools
               SET wins = wins + 1,
                   wayfinder_match_ids = array_append(wayfinder_match_ids, $1),
                   updated_at = NOW()
               WHERE share_id = $2`,
              [matchId, player2Pool.share_id]
            )
          }
        } else if (winner === 'draw') {
          // Both players draw
          if (player1Pool) {
            await query(
              `UPDATE card_pools
               SET draws = draws + 1,
                   wayfinder_match_ids = array_append(wayfinder_match_ids, $1),
                   updated_at = NOW()
               WHERE share_id = $2`,
              [matchId, player1Pool.share_id]
            )
          }
          if (player2Pool) {
            await query(
              `UPDATE card_pools
               SET draws = draws + 1,
                   wayfinder_match_ids = array_append(wayfinder_match_ids, $1),
                   updated_at = NOW()
               WHERE share_id = $2`,
              [matchId, player2Pool.share_id]
            )
          }
        }

        // Advance round (handles broadcasting)
        const { checkAndAdvanceRound } = await import('@/src/services/matchmaking/advancement')
        await checkAndAdvanceRound(poolWithPod.pod_id, poolWithPod.pod_share_id)
      } else {
        // Match not yet decided — broadcast so MatchCard dots update in real-time
        broadcastDraftState(poolWithPod.pod_share_id)
      }
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
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }
    return handleApiError(error)
  }
}
