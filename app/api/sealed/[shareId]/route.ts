// @ts-nocheck
// GET /api/sealed/:shareId - Get sealed pod details
// DELETE /api/sealed/:shareId - Delete sealed pod (host only)
import { query, queryRow, queryRows } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { getPackArtUrl } from '@/src/utils/packArt'
import { jsonParse } from '@/src/utils/json'
import { broadcastSealedPodState, broadcastSystemChatMessage, broadcastPublicPodsUpdate } from '@/src/lib/socketBroadcast'
import { markPodCancelled, deletePodMessage } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)

    const pod = await queryRow(
      `SELECT
        dp.id, dp.share_id, dp.host_id, dp.status, dp.current_players, dp.max_players,
        dp.set_code, dp.set_name, dp.name, dp.settings, dp.state_version,
        dp.is_public, dp.competitive, dp.deck_lock_at, dp.decks_unlocked,
        dp.created_at, dp.updated_at,
        u.username as host_username,
        u.avatar_url as host_avatar
       FROM pods dp
       LEFT JOIN users u ON dp.host_id = u.id
       WHERE dp.share_id = $1 AND dp.pod_type = 'sealed'`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Sealed pod not found', 404)
    }

    const players = await queryRows(
      `SELECT
        dpp.*,
        u.id as user_id,
        u.username,
        u.avatar_url
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    )

    const settings = jsonParse(pod.settings, {})

    const formattedPlayers = players.map(p => ({
      id: p.user_id,
      username: p.username,
      avatarUrl: p.avatar_url,
      seatNumber: p.seat_number,
    }))

    const isPlayer = session ? players.some(p => p.user_id === session.id) : false

    return jsonResponse({
      id: pod.id,
      shareId: pod.share_id,
      setCode: pod.set_code,
      setName: pod.set_name,
      name: pod.name,
      setArtUrl: getPackArtUrl(pod.set_code),
      status: pod.status,
      maxPlayers: pod.max_players,
      currentPlayers: pod.current_players,
      stateVersion: pod.state_version,
      settings,
      host: {
        id: pod.host_id,
        username: pod.host_username,
        avatarUrl: pod.host_avatar,
      },
      players: formattedPlayers,
      isPublic: pod.is_public || false,
      competitive: pod.competitive === true,
      deckBuildDeadline: pod.deck_lock_at || null,
      decksUnlocked: pod.decks_unlocked === true,
      isHost: session ? pod.host_id === session.id : false,
      isPlayer,
      createdAt: pod.created_at,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    const pod = await queryRow(
      `SELECT id, host_id, share_id, set_code, set_name, name, max_players, current_players, pod_type, is_public
       FROM pods WHERE share_id = $1 AND pod_type = 'sealed'`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Sealed pod not found', 404)
    }

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can delete the sealed pod', 403)
    }

    // Notify web chat before deleting
    broadcastSystemChatMessage(shareId, `❌ **${session.username}** cancelled the sealed pod.`)

    // Discord LFG: auto-decide based on human count
    const players = await queryRows(
      `SELECT pp.is_bot, u.username FROM pod_players pp JOIN users u ON pp.user_id = u.id WHERE pp.pod_id = $1 ORDER BY pp.seat_number`,
      [pod.id]
    )
    const humanCount = players.filter((p: { is_bot: boolean }) => !p.is_bot).length
    const podInfo = { id: pod.id, share_id: pod.share_id, set_code: pod.set_code, set_name: pod.set_name, name: pod.name, max_players: pod.max_players, current_players: pod.current_players, pod_type: 'sealed' as const }

    if (humanCount < 2) {
      // Not a real multiplayer pod — delete the Discord message entirely
      await deletePodMessage(podInfo).catch(() => {})
      await query(
        `UPDATE pods SET discord_message_id = NULL, discord_thread_id = NULL,
         discord_webhook_id = NULL, discord_webhook_token = NULL WHERE id = $1`,
        [pod.id]
      ).catch(() => {})
    } else {
      // Real multiplayer pod — mark the embed as cancelled for history
      const playerNames = players.map((p: { username: string }) => p.username)
      await markPodCancelled(podInfo, session.username, playerNames).catch(() => {})
    }

    // Delete associated card_pools
    await query('DELETE FROM card_pools WHERE pod_id = $1', [pod.id])

    // Delete pod (cascade will remove players)
    await query('DELETE FROM pods WHERE id = $1', [pod.id])

    // Broadcast deletion to all connected clients (pod is gone, so this emits 'deleted')
    broadcastSealedPodState(shareId).catch(err => {
      console.error('Error broadcasting sealed pod deletion:', err)
    })
    broadcastPublicPodsUpdate().catch(err => {
      console.error('Error broadcasting public pods update:', err)
    })

    return jsonResponse({ message: 'Sealed pod deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
