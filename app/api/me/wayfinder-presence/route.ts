import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'

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
 * Beta/admin access is returned alongside activity so beta users can open the
 * stats dashboard even before they have recorded a game.
 *
 * Unauthenticated or on any error → no activity/access (never block the UI).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let userId: string
  let hasBetaAccess = false
  try {
    const session = requireAuth(request)
    userId = session.id
    hasBetaAccess = Boolean(session.is_beta_tester || session.is_admin)
  } catch {
    return NextResponse.json({ data: { hasActivity: false, hasBetaAccess: false } })
  }

  try {
    const row = await queryRow(
      `SELECT (
         EXISTS (SELECT 1 FROM casual_matches WHERE user_id = $1 AND retracted_at IS NULL)
         OR EXISTS (SELECT 1 FROM practice_matches WHERE player1_id = $1 OR player2_id = $1)
         OR EXISTS (
           SELECT 1 FROM card_pools
           WHERE user_id = $1
             AND (COALESCE(wins, 0) + COALESCE(losses, 0) + COALESCE(draws, 0)) > 0
         )
       ) AS has_activity`,
      [userId],
    )
    return NextResponse.json({ data: { hasActivity: Boolean(row?.has_activity), hasBetaAccess } })
  } catch (err) {
    console.error('wayfinder-presence query failed:', err)
    return NextResponse.json({ data: { hasActivity: false, hasBetaAccess } })
  }
}
