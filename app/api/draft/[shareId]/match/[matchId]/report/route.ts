// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow, query } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { deriveMatchWinner } from '@/src/services/matchmaking/results'
import { checkAndAdvanceRound } from '@/src/services/matchmaking/advancement'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string; matchId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId, matchId } = await params
    const body = await request.json()
    const { game1, game2, game3 } = body

    // Validate game result values
    const validValues = ['player1', 'player2', 'draw', null]
    if (!validValues.includes(game1) || !validValues.includes(game2)) {
      return jsonResponse({ error: 'Invalid game result' }, 400)
    }
    if (game3 !== undefined && game3 !== null && !validValues.includes(game3)) {
      return jsonResponse({ error: 'Invalid game result' }, 400)
    }

    // Get the match and verify user is a participant
    const match = await queryRow(
      `SELECT pm.*, pr.pod_id, p.share_id as pod_share_id
       FROM practice_matches pm
       JOIN practice_rounds pr ON pm.round_id = pr.id
       JOIN pods p ON pr.pod_id = p.id
       WHERE pm.id = $1 AND p.share_id = $2`,
      [matchId, shareId]
    )

    if (!match) {
      return jsonResponse({ error: 'Match not found' }, 404)
    }

    if (match.final_confirmed) {
      return jsonResponse({ error: 'Match already confirmed' }, 400)
    }

    const isPlayer1 = match.player1_id === session.id
    const isPlayer2 = match.player2_id === session.id
    if (!isPlayer1 && !isPlayer2) {
      return jsonResponse({ error: 'You are not in this match' }, 403)
    }

    // Store this player's submission
    // Both players write to the same game result fields — last writer wins
    // Pod owner can resolve conflicts via override endpoint
    await query(
      `UPDATE practice_matches SET
         game1_result = $2,
         game2_result = $3,
         game3_result = $4,
         ${isPlayer1 ? 'player1_submitted' : 'player2_submitted'} = true
       WHERE id = $1`,
      [matchId, game1, game2, game3 || null]
    )

    // Refetch to check if both submitted
    const updated = await queryRow(`SELECT * FROM practice_matches WHERE id = $1`, [matchId])

    if (updated.player1_submitted && updated.player2_submitted) {
      // Both submitted — auto-confirm with derived winner
      const winner = deriveMatchWinner(updated.game1_result, updated.game2_result, updated.game3_result)
      if (winner) {
        await query(
          `UPDATE practice_matches SET final_confirmed = true, match_winner = $2 WHERE id = $1`,
          [matchId, winner]
        )
        await checkAndAdvanceRound(match.pod_id, shareId)
      }
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
