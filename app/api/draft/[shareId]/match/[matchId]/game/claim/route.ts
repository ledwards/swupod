import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, jsonResponse } from '@/lib/utils'
import {
  claimPracticeMatchGame,
  PracticeGameClaimError,
} from '@/src/services/matchmaking/liveGames'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string; matchId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId, matchId } = await params

    const claim = await claimPracticeMatchGame({
      shareId,
      matchId,
      userId: session.id,
    })

    return jsonResponse(claim)
  } catch (error) {
    if (error instanceof PracticeGameClaimError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status)
    }

    return handleApiError(error)
  }
}
