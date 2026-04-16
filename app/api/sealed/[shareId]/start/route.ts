// @ts-nocheck
// POST /api/sealed/:shareId/start - Start the sealed pod (host only)
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { generateShareId, formatSetCodeRange } from '@/lib/utils'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { generateSealedBox, clearBeltCache } from '@/src/utils/boosterPack'
import { initializeCardCache } from '@/src/utils/cardCache'
import { computeRandomPairings } from '@/src/utils/podPairings'
import { broadcastSealedPodState, broadcastPublicPodsUpdate, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { markPodStarted } from '@/lib/discordLfg'
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

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can start the sealed pod', 403)
    }

    if (pod.status !== 'waiting') {
      return errorResponse('Sealed pod has already started', 400)
    }

    // Get all players
    const players = await queryRows(
      `SELECT dpp.*, u.username
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    )

    // Admins can bypass the 2-player minimum for testing/facilitation.
    if (players.length < 2 && !session.is_admin) {
      return errorResponse('Need at least 2 players to start', 400)
    }

    // Generate packs for all players (6 packs each)
    await initializeCardCache()
    const totalPacks = players.length * 6
    clearBeltCache()
    const allPacks = generateSealedBox([], pod.set_code, totalPacks)

    // Compute random pairings
    const pairingPlayers = players.map(p => ({
      userId: p.user_id,
      seatNumber: p.seat_number,
    }))
    const pairings = computeRandomPairings(pairingPlayers)

    // Create a card_pool for each player
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const year = String(now.getFullYear()).slice(-2)

    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const playerPacks = allPacks.slice(i * 6, (i + 1) * 6)
      const allCards = playerPacks.flatMap(pack => pack.cards || pack)

      const poolShareId = generateShareId(8)
      const defaultName = `${pod.set_code} Sealed ${month}/${day}/${year}`

      await query(
        `INSERT INTO card_pools (
          user_id,
          share_id,
          set_code,
          set_name,
          pool_type,
          name,
          cards,
          packs,
          pod_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          player.user_id,
          poolShareId,
          pod.set_code,
          pod.set_name,
          'sealed',
          defaultName,
          JSON.stringify(allCards),
          JSON.stringify(playerPacks.map(p => ({ cards: p.cards || p }))),
          pod.id
        ]
      )
    }

    // Store pairings in settings and mark complete
    const currentSettings = typeof pod.settings === 'string'
      ? JSON.parse(pod.settings)
      : pod.settings || {}

    const updatedSettings = {
      ...currentSettings,
      pairings: pairings,
    }

    await query(
      `UPDATE pods
       SET status = 'complete',
           settings = $1,
           state_version = state_version + 1,
           completed_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(updatedSettings), pod.id]
    )

    broadcastSealedPodState(shareId).catch(err => {
      console.error('Error broadcasting sealed pod state:', err)
    })
    broadcastPublicPodsUpdate().catch(err => {
      console.error('Error broadcasting public pods update:', err)
    })

    // Broadcast start to web chat
    const podLabel = pod.name || `${pod.set_name} Sealed`
    broadcastSystemChatMessage(shareId, `🚀 **${podLabel}** has started! Good luck everyone!`)

    // Discord LFG: mark pod as started (fire-and-forget)
    if (pod.is_public) {
      const hostPlayer = players.find(p => p.user_id === pod.host_id)
      markPodStarted(
        { ...pod, current_players: players.length, pod_type: 'sealed' },
        hostPlayer?.username || 'Host',
        players.map(p => p.username)
      ).catch(() => {})
    }

    return jsonResponse({ message: 'Sealed pod started', status: 'complete' })
  } catch (error) {
    return handleApiError(error)
  }
}
