// @ts-nocheck
// POST /api/draft/:shareId/dev/add-bots - Add bot players for testing (dev only)
import { query, queryRow, queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { NextRequest, NextResponse } from 'next/server'

const BOT_CONFIGS = [
  { name: 'DraftBot Alpha', discordId: 'bot_alpha' },
  { name: 'DraftBot Beta', discordId: 'bot_beta' },
  { name: 'DraftBot Gamma', discordId: 'bot_gamma' },
  { name: 'DraftBot Delta', discordId: 'bot_delta' },
  { name: 'DraftBot Epsilon', discordId: 'bot_epsilon' },
  { name: 'DraftBot Zeta', discordId: 'bot_zeta' },
  { name: 'DraftBot Eta', discordId: 'bot_eta' },
  { name: 'DraftBot Theta', discordId: 'bot_theta' },
]

const BOT_AVATARS = [
  'https://cdn.discordapp.com/embed/avatars/0.png',
  'https://cdn.discordapp.com/embed/avatars/1.png',
  'https://cdn.discordapp.com/embed/avatars/2.png',
  'https://cdn.discordapp.com/embed/avatars/3.png',
  'https://cdn.discordapp.com/embed/avatars/4.png',
]

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const url = new URL(request.url)
    const count = Math.min(7, Math.max(1, parseInt(url.searchParams.get('count') || '1', 10)))

    // Get draft pod (only need id, status, max_players)
    const pod = await queryRow(
      'SELECT id, status, max_players FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.status !== 'waiting') {
      return errorResponse('Can only add bots during lobby', 400)
    }

    // Get current players
    const players = await queryRows(
      'SELECT seat_number FROM pod_players WHERE pod_id = $1',
      [pod.id]
    )

    const takenSeats = new Set(players.map(p => p.seat_number))
    const availableSeats: number[] = []
    // Fill seats from highest to lowest so bots appear clockwise (right-to-left)
    // from the host's perspective in the player circle
    for (let i = pod.max_players; i >= 1; i--) {
      if (!takenSeats.has(i)) availableSeats.push(i)
    }

    if (availableSeats.length === 0) {
      return errorResponse('Draft is full', 400)
    }

    const botsToAdd = Math.min(count, availableSeats.length)
    const addedBots: { name: string; seatNumber: number }[] = []

    for (let i = 0; i < botsToAdd; i++) {
      const seatNumber = availableSeats[i]
      const botIndex = (players.length + i) % BOT_CONFIGS.length
      const botConfig = BOT_CONFIGS[botIndex]
      const botAvatar = BOT_AVATARS[botIndex % BOT_AVATARS.length]

      // Find or create bot user with stable discord_id
      const userResult = await query(
        `INSERT INTO users (username, avatar_url, discord_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (discord_id) DO UPDATE SET username = $1, avatar_url = $2
         RETURNING id`,
        [botConfig.name, botAvatar, botConfig.discordId]
      )
      const botUserId = userResult.rows[0].id

      // Add bot to draft
      await query(
        `INSERT INTO pod_players (
          pod_id,
          user_id,
          seat_number,
          pick_status,
          drafted_cards,
          leaders,
          drafted_leaders,
          is_bot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pod.id,
          botUserId,
          seatNumber,
          'waiting',
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          true
        ]
      )

      addedBots.push({ name: botConfig.name, seatNumber })
    }

    // Update player count
    await query(
      `UPDATE pods
       SET current_players = current_players + $1,
           state_version = state_version + 1
       WHERE id = $2`,
      [botsToAdd, pod.id]
    )

    // Broadcast update to all clients
    await broadcastDraftState(shareId)

    // Chat messages for each bot
    for (const bot of addedBots) {
      broadcastSystemChatMessage(shareId, `📥 **${bot.name}** joined the pod.`)
    }

    return jsonResponse({
      message: `Added ${botsToAdd} bot(s)`,
      bots: addedBots,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
