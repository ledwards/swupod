// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow, query } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { checkAndAdvanceRound } from '@/src/services/matchmaking/advancement'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string; userId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId, userId } = await params

    const pod = await queryRow(
      `SELECT id, host_id FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    if (pod.host_id !== session.id) {
      return jsonResponse({ error: 'Only the pod owner can boot players' }, 403)
    }

    if (userId === session.id) {
      return jsonResponse({ error: 'Cannot boot yourself' }, 400)
    }

    await query(
      `UPDATE pod_players SET dropped = true, dropped_at = NOW() WHERE pod_id = $1 AND user_id = $2`,
      [pod.id, userId]
    )

    await query(
      `UPDATE practice_matches
       SET final_confirmed = true,
           match_winner = CASE
             WHEN player1_id = $2 THEN 'player2'
             WHEN player2_id = $2 THEN 'player1'
           END
       WHERE pod_id = $1
         AND final_confirmed = false
         AND (player1_id = $2 OR player2_id = $2)`,
      [pod.id, userId]
    )

    await checkAndAdvanceRound(pod.id, shareId)

    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state after boot:', err)
    })

    return jsonResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
