// POST /api/draft/:shareId/ready - the calling player marks themselves ready
// (or not) in the draft lobby.
//
// Ready is a lobby handshake, not a host action: the host's "Deal Packs" button
// only enables once every HUMAN seat is ready. Bots are always ready and never
// own a row's `lobby_ready`. On the client, the same click is the user gesture
// that unlocks browser audio for the voice cues.
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

interface ReadyPod {
  status?: string
}

interface ReadyPlayer {
  id?: string
  is_bot?: boolean
  lobby_ready?: boolean
}

type ReadyValidation =
  | { ok: true }
  | { ok: false; status: number; message: string }

/**
 * Pure guard for the ready toggle (exported for unit tests).
 *
 * Ready only means anything while the pod is still in the lobby — once packs
 * are dealt the flag is history, and a late toggle would silently re-enable the
 * host's deal button on a draft that already started.
 *
 * @param pod - Pod row (status)
 * @param player - The caller's pod_players row, or null if they have no seat
 */
export function validateReadyToggle(pod: ReadyPod, player: ReadyPlayer | null): ReadyValidation {
  if (pod.status !== 'waiting') {
    return { ok: false, status: 400, message: 'Draft has already started' }
  }
  if (!player) {
    return { ok: false, status: 403, message: 'Not in this draft' }
  }
  if (player.is_bot === true) {
    // Unreachable through the API (bots have no session) but keeps the rule in
    // one place: a bot is ready by definition and never stores the flag.
    return { ok: false, status: 400, message: 'Bots are always ready' }
  }
  return { ok: true }
}

/**
 * The value to store: an explicit boolean in the body wins (idempotent for
 * retries and double-clicks), anything else toggles.
 *
 * @param player - The caller's pod_players row
 * @param requested - `ready` from the request body, if any
 */
export function resolveReadyValue(player: ReadyPlayer, requested?: unknown): boolean {
  if (typeof requested === 'boolean') return requested
  return player.lobby_ready !== true
}

/**
 * Whether every human seat has readied — the gate on the host's deal button.
 * Bots are ready by definition.
 *
 * @param players - Pod player rows
 */
export function allHumansReady(players: { is_bot?: boolean; lobby_ready?: boolean }[]): boolean {
  const humans = players.filter(p => p.is_bot !== true)
  if (humans.length === 0) return true
  return humans.every(p => p.lobby_ready === true)
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    const pod = await queryRow(
      'SELECT id, share_id, status FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    const player = await queryRow(
      'SELECT id, is_bot, lobby_ready FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [pod.id, session.id]
    )

    const validation = validateReadyToggle(pod as ReadyPod, (player as ReadyPlayer) || null)
    if (!validation.ok) {
      return errorResponse(validation.message, validation.status)
    }

    const body = await request.json().catch(() => ({}))
    const ready = resolveReadyValue(player as ReadyPlayer, (body as { ready?: unknown })?.ready)

    await query(
      'UPDATE pod_players SET lobby_ready = $1 WHERE id = $2',
      [ready, (player as ReadyPlayer).id]
    )

    // Bump the version so every client's socket handler treats this as fresh
    // public state (readiness is drawn around the table for everyone).
    await query(
      'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
      [pod.id]
    )

    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    return jsonResponse({ ready })
  } catch (error) {
    return handleApiError(error)
  }
}
