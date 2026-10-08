// @ts-nocheck
// GET /api/sealed/:shareId/pod - Get sealed pod page data (pairings, readiness, opponent)
//
// Returns pod data including player list, pairings, bye info, and readiness.
// Readiness is determined by whether a player has a built_decks entry.
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)

    const pod = await queryRow(
      `SELECT
        dp.id, dp.share_id, dp.host_id, dp.status, dp.set_code, dp.set_name,
        dp.settings, dp.completed_at, dp.competitive
       FROM pods dp
       WHERE dp.share_id = $1 AND dp.pod_type = 'sealed'`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Sealed pod not found', 404)
    }

    if (pod.status !== 'complete') {
      return errorResponse('Sealed pod is not complete yet', 400)
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

    // Get pairings from settings
    const settings = jsonParse(pod.settings, {})
    const storedPairings = settings.pairings || null

    // Determine current user's context
    const isHost = session?.id === pod.host_id
    const myPlayer = session ? players.find(p => p.user_id === session.id) : null

    // Find my opponent and bye status from stored pairings
    let myOpponent = null
    let myBye = false

    if (myPlayer && storedPairings) {
      if (storedPairings.byePlayerId === myPlayer.user_id) {
        myBye = true
      } else {
        const myMatch = (storedPairings.matches || []).find(
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

    // Build match objects with player details
    const matches = (storedPairings?.matches || []).map(m => {
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
    })

    const byePlayerId = storedPairings?.byePlayerId || null

    // Build response matching draft pod API structure
    const response = {
      draft: {
        shareId: pod.share_id,
        setCode: pod.set_code,
        setName: pod.set_name,
        hostId: pod.host_id,
        status: pod.status,
        completedAt: pod.completed_at,
        // Competitive Sealed pods have no stored pairings — this hub's casual
        // "Your Opponent" card is meaningless for them, so the page bounces
        // them to the Swiss play page instead.
        competitive: pod.competitive === true,
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
        matches,
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
