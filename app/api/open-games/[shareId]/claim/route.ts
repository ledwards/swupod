/**
 * POST /api/open-games/:shareId/claim - the match page asks what this seat
 * should do next (create_lobby / wait_for_lobby / join_lobby / open_lobby /
 * lobby_link). Seat-membership enforced in the service (403 otherwise).
 * Body: { companionCapable: boolean }
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { claimOpenGame, OpenGameLiveError } from '@/src/services/openGameLive'
import { openGameErrorResponse } from '../../helpers'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const { shareId } = await params
    const session = requireAuth(request)
    const body = await request.json().catch(() => ({}))

    const claim = await claimOpenGame({
      shareId,
      userId: session.id,
      companionCapable: body.companionCapable === true,
    })
    return jsonResponse({ claim })
  } catch (error) {
    if (error instanceof OpenGameLiveError) {
      return Response.json(
        { success: false, data: null, message: error.message, code: error.code },
        { status: error.status }
      )
    }
    return openGameErrorResponse(error)
  }
}
