/**
 * GET  /api/open-games  - public lobby board: open listings + recent results.
 *                         No auth (anonymous board is read-only, R2/R26).
 * POST /api/open-games  - create a listing ("New Game", R6/R28/R32).
 *                         Body: { poolShareId, visibility?: 'public'|'private' }
 */
import { requireAuth, getSession } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { broadcastOpenGamesUpdate } from '@/src/lib/socketBroadcast'
import { listPublicOpenGames, postOpenGame, setOpenGameDiscordMessage } from '@/src/services/openGames'
import { postOpenGameCreated } from '@/lib/discordLfg'
import { resolvePoolId, openGameErrorResponse } from './helpers'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { listings, recentCompleted } = await listPublicOpenGames()
    const presence = global.presenceMap
    // Board stays anonymous-readable; the session (when present) only marks
    // which listings belong to the viewer so the UI can offer Leave, not Join.
    const session = getSession(request)
    return jsonResponse({
      listings: listings.map(({ hostId, ...listing }) => ({
        ...listing,
        hostConnected: presence ? presence.has(hostId as string) : true,
        mine: session != null && String(hostId) === String(session.id),
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
      // Discord LFG ping (R9): cooldown-gated inside, public only, never blocks.
      postOpenGameCreated(game, session.username ?? 'A player', session.id)
        .then(async messageId => {
          if (messageId) await setOpenGameDiscordMessage(game.id, messageId)
        })
        .catch(() => {})
    }
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
