// POST /api/draft/:shareId/ready - the calling player marks themselves ready in
// the draft lobby.
//
// ONE-WAY. There is no un-readying: readiness is what the host's deal button
// waits on, so letting a seat withdraw it means the table can be held hostage,
// and a player who readied and wandered off would look present forever anyway.
// The endpoint is therefore idempotent — pressing again, retrying, or posting
// `ready: false` all leave the seat ready.
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
import { validateReadyToggle, resolveReadyValue, type ReadyPod, type ReadyPlayer } from './validation'

interface RouteContext {
  params: Promise<{ shareId: string }>
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

    const ready = resolveReadyValue()

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
