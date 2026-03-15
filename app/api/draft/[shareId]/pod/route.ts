// @ts-nocheck
/**
 * GET /api/draft/:shareId/pod - Get pod page data (pairings, readiness, opponent)
 *
 * Returns pod data including player list, pairings, bye info, and readiness.
 * Readiness is determined by whether a player has a built_decks entry.
 */
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { computePairings } from '@/src/utils/podPairings'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)

    // Load draft pod
    const pod = await queryRow(
      `SELECT
        dp.id, dp.share_id, dp.host_id, dp.status, dp.set_code, dp.set_name, dp.name,
        dp.draft_state, dp.completed_at, dp.settings,
        u.username as host_username,
        u.avatar_url as host_avatar
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

    // Load all players with their pool and built_decks status
    const players = await queryRows(
      `SELECT
        dpp.user_id,
        dpp.seat_number,
        u.username,
        u.avatar_url,
        cp.share_id as pool_share_id,
        cp.id as pool_id,
        CASE WHEN bd.id IS NOT NULL THEN true ELSE false END as is_ready
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       LEFT JOIN card_pools cp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
       LEFT JOIN built_decks bd ON bd.card_pool_id = cp.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    )

    // Parse draft_state to check for stored bye
    const draftState = jsonParse(pod.draft_state, {})
    const storedByePlayerId = draftState.pod?.byePlayerId || null

    // Compute pairings
    const playerData = players.map(p => ({
      userId: p.user_id,
      seatNumber: p.seat_number,
    }))
    const { matches, byePlayerId } = computePairings(playerData, storedByePlayerId)

    // If bye was newly assigned (not stored yet), persist it
    if (byePlayerId && byePlayerId !== storedByePlayerId) {
      const updatedState = {
        ...draftState,
        pod: { ...draftState.pod, byePlayerId },
      }
      await queryRow(
        `UPDATE pods SET draft_state = $1 WHERE id = $2`,
        [JSON.stringify(updatedState), pod.id]
      )
    }

    // Determine current user's context
    const isHost = session?.id === pod.host_id
    const myPlayer = session ? players.find(p => p.user_id === session.id) : null

    // Find my opponent
    let myOpponent = null
    let myBye = false

    if (myPlayer) {
      if (byePlayerId === myPlayer.user_id) {
        myBye = true
      } else {
        // Find my match
        const myMatch = matches.find(
          m => m.player1Id === myPlayer.user_id || m.player2Id === myPlayer.user_id
        )
        if (myMatch) {
          const opponentId = myMatch.player1Id === myPlayer.user_id
            ? myMatch.player2Id
            : myMatch.player1Id
          const opponent = players.find(p => p.user_id === opponentId)
          if (opponent) {
            myOpponent = {
              id: opponent.user_id,
              username: opponent.username,
              avatarUrl: opponent.avatar_url,
              isReady: opponent.is_ready,
              poolShareId: opponent.pool_share_id,
            }
          }
        }
      }
    }

    // Build response
    const response = {
      draft: {
        shareId: pod.share_id,
        setCode: pod.set_code,
        setName: pod.set_name,
        name: pod.name,
        hostId: pod.host_id,
        status: pod.status,
        completedAt: pod.completed_at,
        settings: typeof pod.settings === 'string' ? JSON.parse(pod.settings) : pod.settings || {},
      },
      players: players.map(p => ({
        id: p.user_id,
        username: p.username,
        avatarUrl: p.avatar_url,
        seatNumber: p.seat_number,
        poolShareId: p.pool_share_id,
        isReady: p.is_ready,
      })),
      pairings: {
        matches: matches.map(m => {
          const p1 = players.find(p => p.user_id === m.player1Id)
          const p2 = players.find(p => p.user_id === m.player2Id)
          return {
            player1: {
              id: m.player1Id,
              username: p1?.username,
              avatarUrl: p1?.avatar_url,
              isReady: p1?.is_ready || false,
            },
            player2: {
              id: m.player2Id,
              username: p2?.username,
              avatarUrl: p2?.avatar_url,
              isReady: p2?.is_ready || false,
            },
          }
        }),
        byePlayer: byePlayerId ? (() => {
          const bp = players.find(p => p.user_id === byePlayerId)
          return bp ? {
            id: bp.user_id,
            username: bp.username,
            avatarUrl: bp.avatar_url,
          } : null
        })() : null,
      },
      myOpponent,
      myBye,
      isHost,
      myPoolShareId: myPlayer?.pool_share_id || null,
    }

    return jsonResponse(response)
  } catch (error) {
    return handleApiError(error)
  }
}
