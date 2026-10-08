// POST /api/draft/:shareId/matchmaking/drop
// Player self-drop DURING Swiss Practice (matchmaking phase).
//
// This is distinct from /api/draft/:shareId/drop, which is the draft-phase drop
// (lobby leave / convert-to-bot) and 400s once the pod is complete. Here the pod
// is complete and running rounds, so dropping forfeits the player's current
// match and removes them from future pairings — the same core the host's boot
// uses, minus the host auth (a player may only drop themselves).
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { dropPlayerFromMatchmaking } from '@/src/services/matchmaking/drops'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { shareId } = await params

    const pod = await queryRow(
      `SELECT id, host_id, draft_state FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    const draftState = (pod.draft_state ?? {}) as { phase?: string; matchmakingStatus?: string }

    // Only valid inside an in-progress Swiss Practice event.
    if (draftState.phase !== 'matchmaking') {
      return jsonResponse({ error: 'Not in a Swiss Practice event' }, 400)
    }

    // The event is over — nothing left to drop from.
    if (draftState.matchmakingStatus === 'complete') {
      return jsonResponse({ error: 'Swiss Practice is already complete' }, 400)
    }

    // Host stays in to run the event; they cancel the pod instead of dropping.
    if (pod.host_id === session.id) {
      return jsonResponse({ error: 'Host cannot drop. Cancel the event instead.' }, 403)
    }

    // Must actually be a (human) player in this pod.
    const player = await queryRow(
      `SELECT user_id FROM pod_players WHERE pod_id = $1 AND user_id = $2 AND is_bot = false`,
      [pod.id, session.id]
    )

    if (!player) {
      return jsonResponse({ error: 'Not in this event' }, 400)
    }

    const result = await dropPlayerFromMatchmaking({
      podId: pod.id as string,
      userId: session.id,
      shareId,
    })

    return jsonResponse({
      ok: true,
      dropped: result.dropped,
      alreadyDropped: !result.dropped,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
