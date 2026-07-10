/**
 * GET /api/open-games/mine - the caller's own active listing (any visibility),
 * for the user-menu "Your Open Lobby" entry. Deck identity is fine here: the
 * caller only ever sees their own deck (R29).
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse } from '@/lib/utils'
import { getMyOpenListing } from '@/src/services/openGames'
import { openGameErrorResponse } from '../helpers'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = requireAuth(request)
    const listing = await getMyOpenListing(session.id)
    return jsonResponse({ listing })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
