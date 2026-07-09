/**
 * POST /api/open-games/play-now - one-click Play Now (R8/AE1/AE2):
 * try-accept the oldest compatible listing, else post/keep the caller's seek.
 * Body: { poolShareId }
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { broadcastOpenGamesUpdate, emitOpenGameEventToUser } from '@/src/lib/socketBroadcast'
import { playNow } from '@/src/services/openGames'
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
    }
    return jsonResponse({ action: result.action, game: result.game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
