// POST /api/draft/:shareId/begin-picking - Open picking after the leader
// preview (host only). The lobby "Ready" (POST /start) deals packs and reveals
// leaders in the 'leader_preview' phase with no timers; this route flips the
// draft to 'leader_draft', starts the pick timer, and lets everyone pick.
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { processBotTurns } from '@/src/utils/botLogic'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { jsonParse } from '@/src/utils/json'
import { NextRequest } from 'next/server'

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

/**
 * Build the next draft_state for the transition, preserving every other key
 * (leaderRound, totalPacks, packNumber, ...). Exported for unit tests.
 */
export function buildBeginPickingDraftState(
  draftState: Record<string, unknown>
): Record<string, unknown> {
  return { ...draftState, phase: 'leader_draft' }
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

    const podId = pod.id as string
    const nextDraftState = buildBeginPickingDraftState(validation.draftState)

    // Open picking for everyone (bots included — processBotTurns picks for them)
    await query(
      `UPDATE pod_players SET pick_status = 'picking' WHERE pod_id = $1`,
      [podId]
    )

    // Flip phase and start the pick timer. Bumping state_version is CRITICAL:
    // useDraftSocket only re-fetches private data (leaders/currentPack) when
    // stateVersion increases.
    await query(
      `UPDATE pods
       SET draft_state = $1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0,
           state_version = state_version + 1
       WHERE id = $2`,
      [JSON.stringify(nextDraftState), podId]
    )

    // Trigger bot picks in the background
    processBotTurns(podId).catch(err => {
      console.error('Error processing bot turns after begin-picking:', err)
    })

    // Broadcast the phase change to all connected clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    return jsonResponse({
      message: 'Picking started',
      phase: 'leader_draft',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
