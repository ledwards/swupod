// POST /api/draft/:shareId/begin-picking - Open picking after the leader
// preview (host only). The lobby "Ready" (POST /start) deals packs and reveals
// leaders in the 'leader_preview' phase with no timers; this route flips the
// draft to 'leader_draft', starts the pick timer, and lets everyone pick.
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { beginPickingTransition } from '@/src/utils/draftPreview'
import { validateBeginPicking, type BeginPickingPod } from './validation'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get draft pod (exclude all_packs to save memory)
    const pod = await queryRow(
      `SELECT id, share_id, host_id, status, draft_state
       FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    const validation = validateBeginPicking(pod as unknown as BeginPickingPod, session.id)
    if (!validation.ok) {
      return errorResponse(validation.message, validation.status)
    }

    // Atomic + idempotent: the validation above ran against a snapshot read, so
    // a second call (host with two tabs, or the deadline sweep firing at the
    // same moment) can get this far too. Only one of them transitions; the
    // loser must do nothing rather than re-stamp the timer and reset seats the
    // winner's bots have already moved on.
    const transitioned = await beginPickingTransition(pod.id as string, shareId)
    if (!transitioned) {
      return errorResponse('Draft is not in the leader preview phase', 409)
    }

    return jsonResponse({
      message: 'Picking started',
      phase: 'leader_draft',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
