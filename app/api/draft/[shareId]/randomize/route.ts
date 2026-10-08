// @ts-nocheck
// POST /api/draft/:shareId/randomize - Randomize seat assignments (host only)
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get draft pod
    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Verify host
    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can randomize seats', 403)
    }

    // Can only randomize during lobby
    if (pod.status !== 'waiting') {
      return errorResponse('Cannot randomize after draft has started', 400)
    }

    // Get all players
    const players = await queryRows(
      'SELECT id FROM pod_players WHERE pod_id = $1',
      [pod.id]
    )

    if (players.length === 0) {
      return errorResponse('No players to randomize', 400)
    }

    // Shuffle player IDs
    const shuffledIds = players.map(p => p.id)
    for (let i = shuffledIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]]
    }

    // Assign new seat numbers
    for (let i = 0; i < shuffledIds.length; i++) {
      await query(
        'UPDATE pod_players SET seat_number = $1 WHERE id = $2',
        [i + 1, shuffledIds[i]]
      )
    }

    // Update state version
    await query(
      'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
      [pod.id]
    )

    // Broadcast state update to all connected clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    return jsonResponse({ message: 'Seats randomized' })
  } catch (error) {
    return handleApiError(error)
  }
}
