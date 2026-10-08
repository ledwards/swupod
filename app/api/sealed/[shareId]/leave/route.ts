// @ts-nocheck
// POST /api/sealed/:shareId/leave - Leave a sealed pod
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastSealedPodState, broadcastPublicPodsUpdate, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { postPlayerLeft, updatePodEmbed } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    const pod = await queryRow(
      `SELECT * FROM pods WHERE share_id = $1 AND pod_type = 'sealed'`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Sealed pod not found', 404)
    }

    if (pod.status !== 'waiting') {
      return errorResponse('Cannot leave after sealed pod has started', 400)
    }

    const player = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [pod.id, session.id]
    )

    if (!player) {
      return errorResponse('Not in this sealed pod', 400)
    }

    if (pod.host_id === session.id) {
      return errorResponse('Host cannot leave. Delete the sealed pod instead.', 400)
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

    broadcastSealedPodState(shareId).catch(err => {
      console.error('Error broadcasting sealed pod state:', err)
    })
    broadcastPublicPodsUpdate().catch(err => {
      console.error('Error broadcasting public pods update:', err)
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

    return jsonResponse({ message: 'Left sealed pod' })
  } catch (error) {
    return handleApiError(error)
  }
}
