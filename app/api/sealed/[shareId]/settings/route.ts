// @ts-nocheck
// PATCH /api/sealed/:shareId/settings - Update sealed pod settings (host only)
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastSealedPodState, broadcastPublicPodsUpdate, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { postPodCreated, deletePodMessage, updatePodDiscord } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)
    const body = await request.json()

    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1 AND pod_type = $2',
      [shareId, 'sealed']
    )

    if (!pod) {
      return errorResponse('Sealed pod not found', 404)
    }

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can update settings', 403)
    }

    if (pod.status !== 'waiting') {
      return errorResponse('Cannot change settings after pod has started', 400)
    }

    const updates: string[] = []
    const values: (boolean | number | string)[] = []
    let paramIndex = 1

    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      updates.push('name = $' + paramIndex++)
      values.push(body.name.trim().slice(0, 100))
    }

    if (typeof body.isPublic === 'boolean') {
      updates.push('is_public = $' + paramIndex++)
      values.push(body.isPublic)
    }

    // Competitive Sealed pods are capped at 8 players.
    const maxAllowed = pod.competitive === true ? 8 : 16
    if (typeof body.maxPlayers === 'number' && body.maxPlayers >= 2 && body.maxPlayers <= maxAllowed) {
      if (body.maxPlayers >= pod.current_players) {
        updates.push('max_players = $' + paramIndex++)
        values.push(body.maxPlayers)
      }
    }

    if (updates.length === 0) {
      return errorResponse('No valid settings to update', 400)
    }

    updates.push('state_version = state_version + 1')
    values.push(pod.id)

    await query(
      'UPDATE pods SET ' + updates.join(', ') + ' WHERE id = $' + paramIndex,
      values
    )

    // Create or delete Discord thread when visibility toggles
    if (typeof body.isPublic === 'boolean') {
      if (body.isPublic && !pod.discord_message_id) {
        // Private → Public: create Discord embed + thread
        const hostRow = await queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id])
        const hostUsername = hostRow?.username || 'Unknown'
        const podInfo = {
          id: pod.id,
          share_id: pod.share_id,
          set_code: pod.set_code,
          set_name: pod.set_name || pod.set_code,
          name: typeof body.name === 'string' ? body.name.trim().slice(0, 100) : pod.name,
          max_players: typeof body.maxPlayers === 'number' ? body.maxPlayers : pod.max_players,
          current_players: pod.current_players,
          pod_type: 'sealed',
          is_public: true,
        }
        postPodCreated(podInfo, hostUsername).catch(err => {
          console.error('[Sealed Settings] Error creating Discord thread:', err)
        })
      } else if (!body.isPublic && pod.discord_message_id) {
        // Public → Private: delete Discord embed + webhook, clear IDs
        const podInfo = {
          id: pod.id,
          share_id: pod.share_id,
          set_code: pod.set_code,
          set_name: pod.set_name || pod.set_code,
          name: pod.name,
          max_players: pod.max_players,
          current_players: pod.current_players,
          pod_type: 'sealed',
          is_public: false,
        }
        deletePodMessage(podInfo).catch(err => {
          console.error('[Sealed Settings] Error deleting Discord thread:', err)
        })
        query(
          'UPDATE pods SET discord_message_id = NULL, discord_thread_id = NULL, discord_webhook_id = NULL, discord_webhook_token = NULL WHERE id = $1',
          [pod.id]
        ).catch(err => {
          console.error('[Sealed Settings] Error clearing Discord IDs:', err)
        })
      }
    }

    // Update Discord thread/embed when properties change on an already-public pod
    if (pod.is_public && pod.discord_message_id && typeof body.isPublic !== 'boolean') {
      const hostRow2 = await queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id])
      const hostUsername2 = hostRow2?.username || 'Unknown'
      const playerRows = await query(
        `SELECT u.username FROM pod_players pp JOIN users u ON u.id = pp.user_id WHERE pp.pod_id = $1 ORDER BY pp.seat_number`,
        [pod.id]
      )
      const playerNames = (playerRows.rows || []).map((r: { username: string }) => r.username)
      const updatedPodInfo = {
        id: pod.id,
        share_id: pod.share_id,
        set_code: pod.set_code,
        set_name: pod.set_name || pod.set_code,
        name: typeof body.name === 'string' ? body.name.trim().slice(0, 100) : pod.name,
        max_players: typeof body.maxPlayers === 'number' ? body.maxPlayers : pod.max_players,
        current_players: pod.current_players,
        pod_type: 'sealed',
        is_public: true,
      }
      updatePodDiscord(updatedPodInfo, hostUsername2, playerNames, pod.name).catch(err => {
        console.error('[Sealed Settings] Error updating Discord:', err)
      })
    }

    // Broadcast rename to web chat
    if (typeof body.name === 'string' && body.name.trim().length > 0 && body.name.trim() !== pod.name) {
      broadcastSystemChatMessage(shareId, `✏️ Pod renamed to **${body.name.trim().slice(0, 100)}**`)
    }

    broadcastSealedPodState(shareId).catch(err => {
      console.error('Error broadcasting sealed pod state:', err)
    })

    // If public visibility or name changed, notify multiplayer page listeners
    if (typeof body.isPublic === 'boolean' || typeof body.name === 'string') {
      broadcastPublicPodsUpdate().catch(err => {
        console.error('Error broadcasting public pods update:', err)
      })
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
