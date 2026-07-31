// POST /api/draft/:shareId/begin-picking - Open picking after the leader
// preview (host only). The lobby "Ready" (POST /start) deals packs and reveals
// leaders in the 'leader_preview' phase with no timers; this route flips the
// draft to 'leader_draft', starts the pick timer, and lets everyone pick.
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { beginPickingTransition } from '@/src/utils/draftPreview'
import { jsonParse } from '@/src/utils/json'
import { NextRequest } from 'next/server'

// The transition itself lives in src/utils/draftPreview so the host's button
// and the preview-deadline sweep run exactly the same code path. Re-exported
// because it is part of this route's tested surface.
export { buildBeginPickingDraftState } from '@/src/utils/draftPreview'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

interface BeginPickingPod {
  host_id: string
  status: string
  draft_state: string | Record<string, unknown>
}

type BeginPickingValidation =
  | { ok: true; draftState: Record<string, unknown> }
  | { ok: false; status: number; message: string }

/**
 * Pure guard for the leader_preview → leader_draft transition (exported for
 * unit tests). Only the host may begin picking, and only while the draft is
 * active in the 'leader_preview' phase.
 */
export function validateBeginPicking(
  pod: BeginPickingPod,
  sessionId: string
): BeginPickingValidation {
  if (pod.host_id !== sessionId) {
    return { ok: false, status: 403, message: 'Only the host can start the draft' }
  }
  if (pod.status !== 'active') {
    return { ok: false, status: 400, message: 'Draft is not active' }
  }
  const draftState = jsonParse<Record<string, unknown>>(pod.draft_state, {}) as Record<string, unknown>
  if (draftState.phase !== 'leader_preview') {
    return { ok: false, status: 409, message: 'Draft is not in the leader preview phase' }
  }
  return { ok: true, draftState }
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
