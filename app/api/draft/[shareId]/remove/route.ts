// @ts-nocheck
// POST /api/draft/:shareId/remove - Remove a player from draft lobby (host only)
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, validateRequired, handleApiError } from '@/lib/utils'
import { broadcastDraftState, broadcastPublicPodsUpdate, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { postPlayerLeft, updatePodEmbed } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)
    const body = await parseBody(request)
    validateRequired(body, ['playerId'])

    const { playerId } = body

    const pod = await queryRow(
      `SELECT * FROM pods WHERE share_id = $1 AND pod_type = 'draft'`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can remove players', 403)
    }

    if (pod.status !== 'waiting') {
      return errorResponse('Cannot remove players after draft has started', 400)
    }

    // Look up by pod_players.id (frontend player.id is the row PK)
    const player = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND id = $2',
      [pod.id, playerId]
    )

    if (!player) {
      return errorResponse('Player not found in this draft', 404)
    }

    if (player.user_id === session.id) {
      return errorResponse('Cannot remove yourself. Delete the draft instead.', 400)
    }

    await query(
      'DELETE FROM pod_players WHERE id = $1',
      [player.id]
    )

    await query(
      `UPDATE pods
       SET current_players = current_players - 1,
           state_version = state_version + 1
       WHERE id = $1`,
      [pod.id]
    )

    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })
    broadcastPublicPodsUpdate().catch(err => {
      console.error('Error broadcasting public pods update:', err)
    })

    // Get the removed player's username for notifications
    const removedUser = await queryRow('SELECT username FROM users WHERE id = $1', [player.user_id])

    // Broadcast removal to web chat
    if (removedUser) {
      broadcastSystemChatMessage(shareId, `📤 **${removedUser.username}** was removed from the draft.`)
    }

    // Discord LFG: post leave message + update embed (fire-and-forget)
    if (pod.is_public && pod.discord_thread_id) {
      if (removedUser) {
        postPlayerLeft(pod.discord_thread_id, removedUser.username).catch(() => {})
      }
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

    return jsonResponse({ message: 'Player removed' })
  } catch (error) {
    return handleApiError(error)
  }
}
