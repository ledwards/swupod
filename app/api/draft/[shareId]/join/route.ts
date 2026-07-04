// @ts-nocheck
// POST /api/draft/:shareId/join - Join a draft pod
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { postPlayerJoined, updatePodEmbed } from '@/lib/discordLfg'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'
import { findNextAvailableSeat } from '@/src/utils/draftSeats'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)
    const body = await request.json().catch(() => ({}))

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
      'SELECT seat_number, is_bot FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [pod.id]
    )

    // Take the LOWEST unoccupied seat, not players.length + 1. Bots fill seats
    // top-down (add-bots), so a host + bots lobby leaves a low-numbered gap;
    // counting rows pointed at an already-occupied seat → a duplicate
    // seat_number that rendered as two children with the same React key
    // (`seat-${n}` in PlayerCircle) and made the joining human invisible.
    const seatNumber = findNextAvailableSeat(
      players.map((p: { seat_number: number }) => p.seat_number),
      pod.max_players,
    )
    if (seatNumber === null) {
      // No free seat despite the current_players guard above (current_players
      // can drift from the real row count). Refuse rather than create a dup.
      return errorResponse('Draft is full', 400)
    }

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

    const existingHumanPlayers = players.filter((p: { is_bot?: boolean }) => !p.is_bot).length
    const existingBotPlayers = players.filter((p: { is_bot?: boolean }) => p.is_bot).length
    const settings = typeof pod.settings === 'string' ? JSON.parse(pod.settings) : pod.settings || {}
    captureLimitedServerEvent(
      LimitedAnalyticsEvents.LIMITED_POD_JOINED,
      session.id,
      {
        format: 'draft',
        mode: settings.isSolo === true ? 'solo' : 'group',
        setCode: pod.set_code,
        join_source: body.joinSource || body.join_source || (pod.is_public ? 'public_pod' : 'private_invite'),
        current_players: pod.current_players + 1,
        human_players: existingHumanPlayers + 1,
        bot_players: existingBotPlayers,
        podShareId: shareId,
        flowId: body.flowId || body.flow_id || null,
      }
    )

    return jsonResponse({
      message: 'Joined draft',
      seatNumber,
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
