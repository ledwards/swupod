// POST /api/draft/:shareId/cancel-event - Pod owner cancels the whole Swiss
// Practice event: every round/pairing/result is deleted and the pod returns to
// its pre-event deck-building lobby (decks unfreeze). Irreversible; the UI gates
// it behind a confirm dialog.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { cancelEvent } from '@/src/services/matchmaking/advancement'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { shareId } = await params

    const pod = await queryRow(
      `SELECT id, host_id, competitive FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    if (pod.host_id !== session.id) {
      return jsonResponse({ error: 'Only the pod owner can cancel the event' }, 403)
    }

    if (!pod.competitive) {
      return jsonResponse({ error: 'Pod is not in competitive mode' }, 400)
    }

    await cancelEvent(pod.id as string, shareId)

    return jsonResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
