import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import {
  setPracticeMatchGameLobby,
  PracticeGameClaimError,
} from '@/src/services/matchmaking/liveGames'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string; matchId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId, matchId } = await params

    const body = await request.json().catch(() => ({}))
    const lobbyUrl = typeof body.lobbyUrl === 'string' ? body.lobbyUrl : ''

    const result = await setPracticeMatchGameLobby({
      shareId,
      matchId,
      userId: session.id,
      lobbyUrl,
    })

    // Push the new lobby_ready game to both players' clients so their Play
    // button flips to the join link live (mirrors the lifecycle route).
    await broadcastDraftState(shareId)

    return jsonResponse(result)
  } catch (error) {
    if (error instanceof PracticeGameClaimError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status)
    }

    return handleApiError(error)
  }
}
