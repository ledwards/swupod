// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { dropPlayerFromMatchmaking } from '@/src/services/matchmaking/drops'

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

    // Host-remove and player self-drop share one core: mark dropped, auto-loss
    // the current match, void orphaned live games, advance the round.
    const result = await dropPlayerFromMatchmaking({ podId: pod.id, userId, shareId })

    return jsonResponse({ ok: true, dropped: result.dropped })
  } catch (error) {
    return handleApiError(error)
  }
}
