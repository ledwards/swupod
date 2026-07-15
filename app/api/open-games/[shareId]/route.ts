/**
 * GET    /api/open-games/:shareId - viewer-shaped game state for the match /
 *                                   private-link page. Opponent deck identity
 *                                   is never included (R29).
 * PATCH  /api/open-games/:shareId - host settings while open (bestOf 1|3).
 * DELETE /api/open-games/:shareId - cancel (either seat, any live status, R20).
 */
import { getSession, requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { queryRow } from '@/lib/db'
import { broadcastOpenGamesUpdate, emitOpenGameEventToUser } from '@/src/lib/socketBroadcast'
import { cancelOpenGame, setOpenGameBestOf } from '@/src/services/openGames'
import { resolveOpenGameMessage } from '@/lib/discordLfg'
import { openGameErrorResponse } from '../helpers'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = getSession(request)
    const row = await queryRow(
      `SELECT og.*, u1.username AS p1_username, u1.avatar_url AS p1_avatar,
              u2.username AS p2_username, u2.avatar_url AS p2_avatar,
              cp1.share_id AS p1_pool_share_id, cp2.share_id AS p2_pool_share_id
       FROM open_games og
       JOIN users u1 ON u1.id = og.player1_id
       LEFT JOIN users u2 ON u2.id = og.player2_id
       LEFT JOIN card_pools cp1 ON cp1.id = og.player1_pool_id
       LEFT JOIN card_pools cp2 ON cp2.id = og.player2_pool_id
       WHERE og.share_id = $1`,
      [shareId]
    )
    if (!row) return errorResponse('Game not found', 404)

    const isPlayer1 = session?.id === row.player1_id
    const isPlayer2 = session?.id === row.player2_id
    const presence = global.presenceMap

    // Seated players see the live Karabast lobby link as soon as the host's
    // Companion reports it — no claim round-trip needed for display.
    let lobbyUrl: string | null = null
    if (isPlayer1 || isPlayer2) {
      const attempt = await queryRow(
        `SELECT lobby_url FROM open_game_lobby_attempts
         WHERE open_game_id = $1 AND lobby_url IS NOT NULL
           AND status IN ('creating', 'lobby_ready', 'joined', 'in_progress')
         ORDER BY attempt_number DESC LIMIT 1`,
        [row.id]
      )
      lobbyUrl = attempt?.lobby_url ? String(attempt.lobby_url) : null
    }

    return jsonResponse({
      game: {
        shareId: row.share_id,
        status: row.status,
        visibility: row.visibility,
        setCode: row.set_code,
        setName: row.set_name,
        format: row.format,
        bestOf: Number(row.best_of) || 1,
        result: row.result,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        completedAt: row.completed_at,
        player2External: row.player2_external === true,
        players: [
          {
            seat: 1,
            username: row.p1_username,
            avatarUrl: row.p1_avatar,
            connected: presence ? presence.has(String(row.player1_id)) : true,
            you: isPlayer1,
          },
          row.player2_id
            ? {
              seat: 2,
              username: row.p2_username,
              avatarUrl: row.p2_avatar,
              connected: presence ? presence.has(String(row.player2_id)) : true,
              you: isPlayer2,
            }
            : null,
        ],
        // Each seat sees only its OWN deck reference (R29).
        yourPoolShareId: isPlayer1 ? row.p1_pool_share_id : isPlayer2 ? row.p2_pool_share_id : null,
        yourSeat: isPlayer1 ? 1 : isPlayer2 ? 2 : null,
        lobbyUrl,
      },
    })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const { shareId } = await params
    const session = requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const game = await setOpenGameBestOf({
      shareId,
      userId: session.id,
      bestOf: Number(body.bestOf),
    })
    // Board rows show Bo3, so keep them live too.
    broadcastOpenGamesUpdate().catch(() => {})
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const { shareId } = await params
    const session = requireAuth(request)
    const row = await queryRow(
      'SELECT id, player1_id, player2_id, status, format, discord_message_id FROM open_games WHERE share_id = $1',
      [shareId]
    )
    if (!row) return errorResponse('Game not found', 404)

    const game = await cancelOpenGame({ gameId: String(row.id), userId: session.id })

    broadcastOpenGamesUpdate().catch(() => {})
    if (row.status === 'open' && row.discord_message_id) {
      resolveOpenGameMessage({ format: String(row.format) }, String(row.discord_message_id), 'cancelled').catch(() => {})
    }
    const other = session.id === row.player1_id ? row.player2_id : row.player1_id
    if (other) {
      emitOpenGameEventToUser(String(other), 'cancelled', { shareId: game.shareId })
    }
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
