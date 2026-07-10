/**
 * POST /api/open-games/play-now - one-click Play Now (R8/AE1/AE2):
 * try-accept the oldest compatible listing, else post/keep the caller's seek.
 * Body: { poolShareId }
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { broadcastOpenGamesUpdate, emitOpenGameEventToUser } from '@/src/lib/socketBroadcast'
import { playNow, setOpenGameDiscordMessage } from '@/src/services/openGames'
import { postOpenGameCreated, resolveOpenGameMessage } from '@/lib/discordLfg'
import { queryRow } from '@/lib/db'
import { resolvePoolId, openGameErrorResponse } from '../helpers'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const session = requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const poolId = await resolvePoolId(body.poolShareId)
    if (!poolId) return errorResponse('poolShareId is required', 400)

    const result = await playNow({ userId: session.id, poolId })

    if (result.action !== 'waiting') {
      broadcastOpenGamesUpdate().catch(() => {})
    }
    if (result.action === 'joined') {
      emitOpenGameEventToUser(result.game.player1Id, 'accepted', { shareId: result.game.shareId })
      queryRow('SELECT discord_message_id FROM open_games WHERE id = $1', [result.game.id])
        .then(async row => {
          if (row?.discord_message_id) {
            await resolveOpenGameMessage(result.game, String(row.discord_message_id), 'matched')
          }
        })
        .catch(() => {})
    }
    if (result.action === 'posted') {
      postOpenGameCreated(result.game, session.username ?? 'A player', session.id)
        .then(async messageId => {
          if (messageId) await setOpenGameDiscordMessage(result.game.id, messageId)
        })
        .catch(() => {})
    }
    return jsonResponse({ action: result.action, game: result.game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
