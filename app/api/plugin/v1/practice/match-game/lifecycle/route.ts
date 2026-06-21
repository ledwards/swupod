import { NextRequest } from 'next/server'
import { requireServiceKey } from '@/lib/auth'
import { errorResponse, handleApiError, jsonResponse } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import {
  PracticeGameLifecycleError,
  recordPracticeMatchGameLifecycle,
  type PracticeGameLifecycleStatus,
} from '@/src/services/matchmaking/liveGames'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    requireServiceKey(request)

    const body = await request.json()
    const practiceMatchGameId = stringField(body.practiceMatchGameId)
    const poolShareId = stringField(body.poolShareId)
    const status = stringField(body.status) as PracticeGameLifecycleStatus | null

    if (!practiceMatchGameId || !poolShareId || !status) {
      return errorResponse('practiceMatchGameId, poolShareId, and status are required', 400)
    }

    const result = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId,
      poolShareId,
      status,
      lobbyId: stringField(body.lobbyId),
      lobbyUrl: stringField(body.lobbyUrl),
      spectateUrl: stringField(body.spectateUrl),
      wayfinderMatchId: stringField(body.wayfinderMatchId),
      wayfinderGameId: stringField(body.wayfinderGameId),
      failureReason: stringField(body.failureReason),
      lifecycleIdempotencyKey: stringField(body.lifecycleIdempotencyKey),
      occurredAt: stringField(body.occurredAt),
    })

    if (result.changed) {
      await broadcastDraftState(result.shareId)
    }

    return jsonResponse(result)
  } catch (error) {
    if (error instanceof PracticeGameLifecycleError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status)
    }

    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }

    return handleApiError(error)
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}
