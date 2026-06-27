import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'

const REQUIRED_CARD_STATS_GAMES = 5

/**
 * GET /api/me/wayfinder-presence
 *
 * "Does the signed-in user have the Wayfinder Companion?" — answered from PTP's
 * OWN data: have they ever recorded a game (a casual/practice match, or a pool
 * carrying a W/L/D)? If so, they obviously have the plugin and must never be
 * nagged to install it.
 *
 * This is the robust, PORT-INDEPENDENT half of detection. The client meta-tag
 * signal (useWayfinderDetection) only fires on :3000/prod, so it misses installed
 * users on other ports/pages; this server signal does not. `usePluginPresence`
 * ORs the two. The fact is monotonic and the query is cheap (EXISTS short-circuits),
 * so it's safe to cache for the page's lifetime.
 *
 * Unauthenticated or on any error → hasActivity:false (never block the UI).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let userId: string
  try {
    userId = requireAuth(request).id
  } catch {
    return NextResponse.json({ data: { hasActivity: false, recordedGames: 0, eligibleForCardStats: false, requiredGames: REQUIRED_CARD_STATS_GAMES } })
  }

  try {
    const row = await queryRow(
      `SELECT
         (
           (SELECT COUNT(*) FROM casual_matches WHERE user_id = $1)
           + (SELECT COUNT(*) FROM practice_matches WHERE player1_id = $1 OR player2_id = $1)
           + COALESCE((
             SELECT SUM(COALESCE(wins, 0) + COALESCE(losses, 0) + COALESCE(draws, 0))
             FROM card_pools
             WHERE user_id = $1
           ), 0)
         )::int AS recorded_games`,
      [userId],
    )
    const recordedGames = Number(row?.recorded_games || 0)
    return NextResponse.json({
      data: {
        hasActivity: recordedGames > 0,
        recordedGames,
        eligibleForCardStats: recordedGames >= REQUIRED_CARD_STATS_GAMES,
        requiredGames: REQUIRED_CARD_STATS_GAMES,
      },
    })
  } catch (err) {
    console.error('wayfinder-presence query failed:', err)
    return NextResponse.json({ data: { hasActivity: false, recordedGames: 0, eligibleForCardStats: false, requiredGames: REQUIRED_CARD_STATS_GAMES } })
  }
}
