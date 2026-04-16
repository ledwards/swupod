// @ts-nocheck
// POST /api/draft/:shareId/join - Join a draft pod
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { postPlayerJoined, updatePodEmbed } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
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

    if (pod.status !== 'waiting') {
      return errorResponse('Draft has already started', 400)
    }

    // Check if already a player
    const existingPlayer = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [pod.id, session.id]
    )

    if (existingPlayer) {
      return jsonResponse({
        message: 'Already in draft',
        seatNumber: existingPlayer.seat_number,
      })
    }

    // Check if draft is full
    if (pod.current_players >= pod.max_players) {
      return errorResponse('Draft is full', 400)
    }

    // Find next available seat
    const players = await queryRows(
      'SELECT seat_number FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [pod.id]
    )

    const seatNumber = players.length + 1

    // Add player
    await query(
      `INSERT INTO pod_players (
        pod_id,
        user_id,
        seat_number,
        pick_status,
        drafted_cards,
        leaders,
        drafted_leaders
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pod.id,
        session.id,
        seatNumber,
        'waiting',
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([])
      ]
    )

    // Update player count and state version
    await query(
      `UPDATE pods
       SET current_players = current_players + 1,
           state_version = state_version + 1
       WHERE id = $1`,
      [pod.id]
    )

    // Broadcast state update to SSE clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    // Broadcast join to web chat
    broadcastSystemChatMessage(shareId, `📥 **${session.username}** joined the pod.`)

    // Discord LFG: post join message + update embed (fire-and-forget)
    if (pod.is_public && pod.discord_thread_id) {
      postPlayerJoined(pod.discord_thread_id, session.username).catch(err => {
        console.error('[Draft Join] Error posting player joined to Discord:', err)
      })
      // Update embed with current player list
      Promise.all([
        queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id]),
        queryRows(
          `SELECT u.username FROM pod_players pp JOIN users u ON pp.user_id = u.id WHERE pp.pod_id = $1 ORDER BY pp.seat_number`,
          [pod.id]
        ),
      ]).then(([hostRow, updatedPlayers]) => {
        const hostName = hostRow?.username || 'Host'
        updatePodEmbed(
          { ...pod, current_players: pod.current_players + 1, competitive: pod.competitive === true },
          hostName,
          updatedPlayers.map((p: { username: string }) => p.username)
        ).catch(err => {
          console.error('[Draft Join] Error updating pod embed:', err)
        })
      }).catch(err => {
        console.error('[Draft Join] Error fetching players for embed update:', err)
      })
    } else if (pod.is_public && !pod.discord_thread_id) {
      console.warn('[Draft Join] Pod is public but has no discord_thread_id — postPodCreated may have failed')
    }

    return jsonResponse({
      message: 'Joined draft',
      seatNumber,
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
