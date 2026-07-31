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
import { cancelOpenGame, exitOpenGame, setOpenGameBestOf, setOpenGameDeck } from '@/src/services/openGames'
import { resolveOpenGameMessage } from '@/lib/discordLfg'
import { poolPackBucketSql, toPackBucket } from '@/src/utils/sealedFormat'
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
              cp1.share_id AS p1_pool_share_id, cp2.share_id AS p2_pool_share_id,
              ${poolPackBucketSql('cp1', 'ppk1')} AS packs_per_player
       FROM open_games og
       JOIN users u1 ON u1.id = og.player1_id
       LEFT JOIN users u2 ON u2.id = og.player2_id
       LEFT JOIN card_pools cp1 ON cp1.id = og.player1_pool_id
       LEFT JOIN card_pools ppk1 ON ppk1.id = cp1.parent_pool_id
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
        // Sealed pack count is a format distinction (6-pack vs 8-pack never pair).
        packsPerPlayer: toPackBucket(row.packs_per_player),
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
    let game
    if (body.poolShareId) {
      const { resolvePoolId } = await import('../helpers')
      const poolId = await resolvePoolId(String(body.poolShareId))
      if (!poolId) return errorResponse('poolShareId is required', 400)
      game = await setOpenGameDeck({ shareId, userId: session.id, poolId })
    } else {
      game = await setOpenGameBestOf({ shareId, userId: session.id, bestOf: Number(body.bestOf) })
    }
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

    // Seat 2 exiting a pre-game lobby VACATES the seat; the host's lobby
    // relists. Everyone else (host, or any seat once in progress) cancels.
    const joinerExit =
      String(row.player2_id) === String(session.id) &&
      ['accepted', 'lobby_ready'].includes(String(row.status))
    const game = joinerExit
      ? await exitOpenGame({ gameId: String(row.id), userId: session.id })
      : await cancelOpenGame({ gameId: String(row.id), userId: session.id })

    broadcastOpenGamesUpdate().catch(() => {})
    if (row.status === 'open' && row.discord_message_id) {
      resolveOpenGameMessage({ format: String(row.format) }, String(row.discord_message_id), 'cancelled').catch(() => {})
    }
    const other = session.id === row.player1_id ? row.player2_id : row.player1_id
    if (other) {
      emitOpenGameEventToUser(String(other), joinerExit ? 'joiner_left' : 'cancelled', { shareId: game.shareId })
    }
    return jsonResponse({ game })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
