/**
 * POST /api/open-games/:shareId/join - join an open game with your own deck
 * (R7/R18/R28/R31). Body: { poolShareId }
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { broadcastOpenGamesUpdate, emitOpenGameEventToUser } from '@/src/lib/socketBroadcast'
import { joinOpenGame } from '@/src/services/openGames'
import { resolveOpenGameMessage } from '@/lib/discordLfg'
import { queryRow } from '@/lib/db'
import { resolvePoolId, openGameErrorResponse } from '../../helpers'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const { shareId } = await params
    const session = requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const poolId = await resolvePoolId(body.poolShareId)
    if (!poolId) return errorResponse('poolShareId is required', 400)

    const game = await joinOpenGame({ shareId, userId: session.id, poolId })

    broadcastOpenGamesUpdate().catch(() => {})
    emitOpenGameEventToUser(game.player1Id, 'accepted', { shareId: game.shareId })
    queryRow('SELECT discord_message_id FROM open_games WHERE id = $1', [game.id])
      .then(async row => {
        if (row?.discord_message_id) {
          await resolveOpenGameMessage(game, String(row.discord_message_id), 'matched')
        }
      })
      .catch(() => {})
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
