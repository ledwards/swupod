import { jsonParse } from '@/src/utils/json'

export interface BeginPickingPod {
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

