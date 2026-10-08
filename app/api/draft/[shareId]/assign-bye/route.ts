// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow, query } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId } = await params

    const pod = await queryRow(
      `SELECT id, host_id FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    if (pod.host_id !== session.id) {
      return jsonResponse({ error: 'Only the pod owner can reassign the bye' }, 403)
    }

    const body = await request.json()
    const { targetUserId } = body

    // Get active round
    const round = await queryRow(
      `SELECT id FROM practice_rounds WHERE pod_id = $1 AND status = 'active' ORDER BY round_number DESC LIMIT 1`,
      [pod.id]
    )

    if (!round) {
      return jsonResponse({ error: 'No active round found' }, 400)
    }

    // Get current bye match
    const byeMatch = await queryRow(
      `SELECT id, player1_id FROM practice_matches WHERE round_id = $1 AND is_bye = true`,
      [round.id]
    )

    // Get target's match
    const targetMatch = await queryRow(
      `SELECT id, player1_id, player2_id FROM practice_matches
       WHERE round_id = $1 AND (player1_id = $2 OR player2_id = $2) AND is_bye = false`,
      [round.id, targetUserId]
    )

    if (!targetMatch) {
      return jsonResponse({ error: 'Target player has no active match' }, 400)
    }

    // Figure out the target's opponent
    const orphanedOpponentId = targetMatch.player1_id === targetUserId
      ? targetMatch.player2_id
      : targetMatch.player1_id

    // Get previous bye player (if any)
    const previousByePlayerId = byeMatch ? byeMatch.player1_id : null

    // Delete old bye match and target's match
    if (byeMatch) {
      await query(`DELETE FROM practice_matches WHERE id = $1`, [byeMatch.id])
    }
    await query(`DELETE FROM practice_matches WHERE id = $1`, [targetMatch.id])

    // Insert new bye match for target (auto-confirmed)
    await query(
      `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, match_winner, created_at)
       VALUES ($1, $2, $3, NULL, true, true, 'player1', NOW())`,
      [round.id, pod.id, targetUserId]
    )

    // If there was a previous bye player, pair them with target's orphaned opponent
    if (previousByePlayerId && orphanedOpponentId) {
      await query(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, created_at)
         VALUES ($1, $2, $3, $4, false, false, NOW())`,
        [round.id, pod.id, previousByePlayerId, orphanedOpponentId]
      )
    }

    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state after assign-bye:', err)
    })

    return jsonResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
