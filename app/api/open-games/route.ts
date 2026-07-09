/**
 * GET  /api/open-games  - public lobby board: open listings + recent results.
 *                         No auth (anonymous board is read-only, R2/R26).
 * POST /api/open-games  - create a listing ("New Game", R6/R28/R32).
 *                         Body: { poolShareId, visibility?: 'public'|'private' }
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { broadcastOpenGamesUpdate } from '@/src/lib/socketBroadcast'
import { listPublicOpenGames, postOpenGame } from '@/src/services/openGames'
import { resolvePoolId, openGameErrorResponse } from './helpers'
import { NextRequest } from 'next/server'

export async function GET(): Promise<Response> {
  try {
    const { listings, recentCompleted } = await listPublicOpenGames()
    const presence = global.presenceMap
    return jsonResponse({
      listings: listings.map(({ hostId, ...listing }) => ({
        ...listing,
        hostConnected: presence ? presence.has(hostId as string) : true,
      })),
      recentCompleted,
    })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const session = requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const poolId = await resolvePoolId(body.poolShareId)
    if (!poolId) return errorResponse('poolShareId is required', 400)

    const visibility = body.visibility === 'private' ? 'private' : 'public'
    const game = await postOpenGame({ userId: session.id, poolId, visibility })

    if (game.visibility === 'public') {
      broadcastOpenGamesUpdate().catch(() => {})
      // Discord LFG ping lands here in U3 (cooldown-gated, public only).
    }
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
