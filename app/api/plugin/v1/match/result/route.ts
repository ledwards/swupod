// app/api/plugin/v1/match/result/route.ts
// @ts-nocheck
// POST /api/plugin/v1/match/result
// Server-to-server: Wayfinder calls this to record a match result on a PTP pool.
// Auth: Authorization: Bearer <PTP_SERVICE_KEY>
import { query, queryRow } from '@/lib/db'
import { requireServiceKey } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireServiceKey(request)

    const body = await request.json()
    const { poolShareId, result, matchId } = body

    if (!poolShareId || !result || !matchId) {
      return errorResponse('poolShareId, result, and matchId are required', 400)
    }
    if (!['win', 'loss', 'draw'].includes(result)) {
      return errorResponse('result must be win, loss, or draw', 400)
    }

    const pool = await queryRow(
      'SELECT id FROM card_pools WHERE share_id = $1',
      [poolShareId]
    )
    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

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

    // If this pool belongs to a competitive pod, update the practice match too
    const poolWithPod = await queryRow(
      `SELECT cp.user_id, p.id as pod_id, p.share_id as pod_share_id, p.competitive
       FROM card_pools cp
       JOIN pods p ON cp.pod_id = p.id
       WHERE cp.share_id = $1`,
      [poolShareId]
    )

    if (poolWithPod?.competitive) {
      const activeRound = await queryRow(
        `SELECT id FROM practice_rounds WHERE pod_id = $1 AND status = 'active' ORDER BY round_number DESC LIMIT 1`,
        [poolWithPod.pod_id]
      )

      if (activeRound) {
        const practiceMatch = await queryRow(
          `SELECT id, player1_id, player2_id FROM practice_matches
           WHERE round_id = $1 AND final_confirmed = false AND is_bye = false
             AND (player1_id = $2 OR player2_id = $2)`,
          [activeRound.id, poolWithPod.user_id]
        )

        if (practiceMatch) {
          const isPlayer1 = practiceMatch.player1_id === poolWithPod.user_id
          // Map win/loss/draw to player1/player2 perspective
          const gameResult = isPlayer1
            ? (result === 'win' ? 'player1' : result === 'loss' ? 'player2' : 'draw')
            : (result === 'win' ? 'player2' : result === 'loss' ? 'player1' : 'draw')

          // Fill in next empty game slot
          const currentMatch = await queryRow(`SELECT * FROM practice_matches WHERE id = $1`, [practiceMatch.id])
          let gameCol = 'game1_result'
          if (currentMatch.game1_result) gameCol = 'game2_result'
          if (currentMatch.game1_result && currentMatch.game2_result) gameCol = 'game3_result'

          await query(
            `UPDATE practice_matches SET ${gameCol} = $2, wayfinder_match_id = $3 WHERE id = $1`,
            [practiceMatch.id, gameResult, matchId]
          )

          // Check if match is now decidable
          const updatedMatch = await queryRow(`SELECT * FROM practice_matches WHERE id = $1`, [practiceMatch.id])
          const { deriveMatchWinner } = await import('@/src/services/matchmaking/results')
          const winner = deriveMatchWinner(updatedMatch.game1_result, updatedMatch.game2_result, updatedMatch.game3_result)

          if (winner) {
            await query(
              `UPDATE practice_matches SET final_confirmed = true, match_winner = $2, player1_submitted = true, player2_submitted = true WHERE id = $1`,
              [practiceMatch.id, winner]
            )
            const { checkAndAdvanceRound } = await import('@/src/services/matchmaking/advancement')
            await checkAndAdvanceRound(poolWithPod.pod_id, poolWithPod.pod_share_id)
          }
        }
      }
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }
    return handleApiError(error)
  }
}
