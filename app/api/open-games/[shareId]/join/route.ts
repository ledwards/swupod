/**
 * POST /api/open-games/:shareId/join - join an open game with your own deck
 * (R7/R18/R28/R31). Body: { poolShareId }
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { broadcastOpenGamesUpdate, emitOpenGameEventToUser } from '@/src/lib/socketBroadcast'
import { joinOpenGame } from '@/src/services/openGames'
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
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
