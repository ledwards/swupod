// @ts-nocheck
// POST /api/draft/:shareId/leave - Leave a draft pod
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { postPlayerLeft, updatePodEmbed } from '@/lib/discordLfg'
import { jsonParse } from '@/src/utils/json'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

/**
 * Leaving is a lobby action, plus the leader preview: packs are dealt there but
 * no pick has happened, so a seat can still be vacated cleanly. It also has to
 * be allowed — the preview is the one phase a player cannot pick their way out
 * of, so without this a pod whose host walked away after hitting Ready would
 * hold everyone hostage until the preview deadline.
 *
 * Exported for unit tests.
 *
 * @param pod - Pod row (status + draft_state)
 * @returns Whether a player may leave right now
 */
export function canLeaveDraft(pod: { status?: string; draft_state?: unknown }): boolean {
  if (pod.status === 'waiting') return true
  if (pod.status !== 'active') return false
  const draftState = jsonParse(pod.draft_state, {}) || {}
  return (draftState as { phase?: string }).phase === 'leader_preview'
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

    // Lobby, or the leader preview (dealt but nobody has picked yet)
    if (!canLeaveDraft(pod)) {
      return errorResponse('Cannot leave after draft has started', 400)
    }

    // Check if user is a player
    const player = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [pod.id, session.id]
    )

    if (!player) {
      return errorResponse('Not in this draft', 400)
    }

    // Host cannot leave - they must delete the draft
    if (pod.host_id === session.id) {
      return errorResponse('Host cannot leave. Delete the draft instead.', 400)
    }

    // Remove player
    await query(
      'DELETE FROM pod_players WHERE id = $1',
      [player.id]
    )

    // Once packs are dealt the seats are a pass ring: passLeaders/passPacks
    // resolve the next seat as `getNextSeat(seat, direction, players.length)`,
    // so a gap in the numbering sends one player's pack to a seat that no
    // longer exists (dropped) while another keeps a pack that was also handed
    // on (duplicated). Close the gap immediately. Only compacting downward, so
    // no two rows ever want the same seat.
    if (pod.status === 'active') {
      await query(
        `WITH compacted AS (
           SELECT id, ROW_NUMBER() OVER (ORDER BY seat_number) AS seat
           FROM pod_players WHERE pod_id = $1
         )
         UPDATE pod_players p
         SET seat_number = compacted.seat
         FROM compacted
         WHERE p.id = compacted.id AND p.seat_number <> compacted.seat`,
        [pod.id]
      )
    }

    // Update player count and state version
    await query(
      `UPDATE pods
       SET current_players = current_players - 1,
           state_version = state_version + 1
       WHERE id = $1`,
      [pod.id]
    )

    // Broadcast state update to SSE clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    // Broadcast leave to web chat
    broadcastSystemChatMessage(shareId, `📤 **${session.username}** left the pod.`)

    // Discord LFG: post leave message + update embed (fire-and-forget)
    if (pod.is_public && pod.discord_thread_id) {
      postPlayerLeft(pod.discord_thread_id, session.username).catch(() => {})
      Promise.all([
        queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id]),
        queryRows(
          `SELECT u.username FROM pod_players pp JOIN users u ON pp.user_id = u.id WHERE pp.pod_id = $1 ORDER BY pp.seat_number`,
          [pod.id]
        ),
      ]).then(([hostRow, updatedPlayers]) => {
        const hostName = hostRow?.username || 'Host'
        updatePodEmbed(
          { ...pod, current_players: pod.current_players - 1 },
          hostName,
          updatedPlayers.map((p: { username: string }) => p.username)
        ).catch(() => {})
      }).catch(() => {})
    }

    return jsonResponse({ message: 'Left draft' })
  } catch (error) {
    return handleApiError(error)
  }
}
