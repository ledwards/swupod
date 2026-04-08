// @ts-nocheck
/**
 * GET /api/draft/:shareId/log?seat=N - Get draft log for a player
 *
 * Reconstructs what each player saw at every pick during the draft.
 * Access control:
 *  - Host: sees all players
 *  - Participant: sees own log + bot logs (+ players who made their log public)
 *  - Non-participant: only sees logs marked public
 *  - Pod-level is_log_public overrides everything (all seats visible)
 * If no seat param, auto-selects first viewable seat.
 */
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { STRATEGY_DISPLAY_NAMES, STRATEGY_DESCRIPTIONS, MIXIN_DISPLAY_NAMES, MIXIN_DESCRIPTIONS } from '@/src/bots/behaviors/strategyDescriptions'
import { reconstructDraftLog } from '@/src/utils/draftLogReconstruction'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)
    const seatParam = request.nextUrl.searchParams.get('seat')

    // Load draft pod with host info and visibility
    const pod = await queryRow(
      `SELECT dp.id, dp.share_id, dp.status, dp.set_code, dp.set_name, dp.all_packs,
              dp.host_id, dp.is_log_public, u.username AS host_username
       FROM pods dp
       LEFT JOIN users u ON dp.host_id = u.id
       WHERE dp.share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.status !== 'complete') {
      return errorResponse('Draft is not complete yet', 400)
    }

    // Load all players with their pick data and visibility
    const players = await queryRows(
      `SELECT DISTINCT ON (dpp.seat_number)
        dpp.user_id,
        dpp.seat_number,
        dpp.drafted_cards,
        dpp.drafted_leaders,
        dpp.is_bot,
        dpp.is_log_public,
        dpp.strategy_name,
        dpp.mixin_name,
        u.username,
        cp.share_id as pool_share_id,
        cp.is_public as pool_is_public
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       LEFT JOIN card_pools cp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number, cp.created_at DESC NULLS LAST`,
      [pod.id]
    )

    if (players.length === 0) {
      return errorResponse('No players found for this draft', 404)
    }

    // Determine which seats this user can view
    const isHost = session && session.id === pod.host_id
    const myPlayer = session ? players.find(p => p.user_id === session.id) : null

    let viewableSeats: number[]
    if (pod.is_log_public) {
      // Pod-level public: everyone sees everything
      viewableSeats = players.map(p => p.seat_number)
    } else if (isHost) {
      // Host sees all players
      viewableSeats = players.map(p => p.seat_number)
    } else if (myPlayer) {
      // Participant sees: own seat + bots + players who made their log public
      viewableSeats = players
        .filter(p => p.user_id === myPlayer.user_id || p.is_bot || p.is_log_public)
        .map(p => p.seat_number)
    } else {
      // Non-participant: only players who made their log public
      viewableSeats = players
        .filter(p => p.is_log_public)
        .map(p => p.seat_number)
    }

    // If no viewable seats, return meta with empty viewableSeats so client can show blank state
    if (viewableSeats.length === 0) {
      return jsonResponse({
        picks: [],
        meta: {
          shareId,
          setCode: pod.set_code,
          setName: pod.set_name,
          targetSeat: null,
          playerName: null,
          hostUsername: pod.host_username || null,
          players: players.map(p => ({
            seatNumber: p.seat_number,
            username: p.username,
            userId: p.user_id,
            isBot: p.is_bot || false,
            isLogPublic: p.is_log_public || false,
            strategyName: p.strategy_name || null,
            strategyDisplayName: p.strategy_name ? (STRATEGY_DISPLAY_NAMES[p.strategy_name] || p.strategy_name) : null,
            strategyDescription: p.strategy_name ? (STRATEGY_DESCRIPTIONS[p.strategy_name] || '') : null,
            mixinName: p.mixin_name || null,
            mixinDisplayName: p.mixin_name ? (MIXIN_DISPLAY_NAMES[p.mixin_name] || p.mixin_name) : null,
            mixinDescription: p.mixin_name ? (MIXIN_DESCRIPTIONS[p.mixin_name] || '') : null,
            poolShareId: p.pool_share_id || null,
            poolIsPublic: p.pool_is_public ?? null,
          })),
          viewableSeats: [],
          isHost: !!isHost,
          isDraftPublic: pod.is_log_public || false,
          myPlayerId: myPlayer?.user_id || null,
        },
      })
    }

    // Parse all_packs
    const allPacks = jsonParse(pod.all_packs, [])
    if (!allPacks || allPacks.length === 0) {
      return errorResponse('Draft pack data not available', 400)
    }

    // Determine target seat
    let targetSeat: number
    if (seatParam) {
      targetSeat = parseInt(seatParam, 10)
      if (isNaN(targetSeat) || targetSeat < 1 || targetSeat > players.length) {
        return errorResponse(`Invalid seat number. Must be 1-${players.length}`, 400)
      }
      // Check access
      if (!viewableSeats.includes(targetSeat)) {
        return errorResponse('You do not have access to this player\'s draft log', 403)
      }
    } else {
      // Auto-select first viewable seat (prefer own seat)
      if (myPlayer && viewableSeats.includes(myPlayer.seat_number)) {
        targetSeat = myPlayer.seat_number
      } else {
        targetSeat = viewableSeats[0]
      }
    }

    // Parse player data
    const playerData = players.map(p => ({
      seatNumber: p.seat_number,
      username: p.username,
      draftedCards: jsonParse(p.drafted_cards, []),
      draftedLeaders: jsonParse(p.drafted_leaders, []),
    }))

    // Reconstruct the draft log
    const picks = reconstructDraftLog({
      targetSeat,
      totalSeats: players.length,
      allPacks,
      players: playerData,
    })

    const targetPlayer = players.find(p => p.seat_number === targetSeat)

    return jsonResponse({
      picks,
      meta: {
        shareId,
        setCode: pod.set_code,
        setName: pod.set_name,
        targetSeat,
        playerName: targetPlayer?.username || `Seat ${targetSeat}`,
        hostUsername: pod.host_username || null,
        players: players.map(p => ({
          seatNumber: p.seat_number,
          username: p.username,
          userId: p.user_id,
          isBot: p.is_bot || false,
          isLogPublic: p.is_log_public || false,
          poolShareId: p.pool_share_id || null,
          poolIsPublic: p.pool_is_public ?? null,
        })),
        viewableSeats,
        isHost: !!isHost,
        isDraftPublic: pod.is_log_public || false,
        myPlayerId: myPlayer?.user_id || null,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
