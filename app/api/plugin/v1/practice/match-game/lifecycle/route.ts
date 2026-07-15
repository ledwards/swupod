import { NextRequest } from 'next/server'
import { requireAuth, requireServiceKey } from '@/lib/auth'
import { errorResponse, handleApiError, jsonResponse } from '@/lib/utils'
import { broadcastDraftState, broadcastOpenGamesUpdate, emitOpenGameEventToUser } from '@/src/lib/socketBroadcast'
import {
  PracticeGameLifecycleError,
  recordPracticeMatchGameLifecycle,
  type PracticeGameLifecycleStatus,
} from '@/src/services/matchmaking/liveGames'
import {
  OpenGameLiveError,
  recordOpenGameLifecycle,
  type OpenGameLifecycleStatus,
} from '@/src/services/openGameLive'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Two credentials reach this route:
    //  - the Wayfinder hub, server-to-server, with Bearer PTP_SERVICE_KEY
    //    (practice AND casual), or
    //  - the Companion itself, DIRECTLY, with the player's own session cookie
    //    (casual only — the dev/self-heal fallback when the hub is
    //    unreachable). That caller is authorized below by SEAT: the session
    //    user must be a player in the open game, enforced in
    //    recordOpenGameLifecycle via actorUserId.
    let actorUserId: string | null = null
    try {
      requireServiceKey(request)
    } catch {
      actorUserId = requireAuth(request).id
    }

    const body = await request.json()

    // Casual open-game variant (Lobby V1): correlated by openGameId instead of
    // practiceMatchGameId. Practice behavior below is untouched.
    const openGameId = stringField(body.openGameId)
    if (openGameId) {
      const casualStatus = stringField(body.status) as OpenGameLifecycleStatus | null
      if (!casualStatus) {
        return errorResponse('status is required', 400)
      }
      const result = await recordOpenGameLifecycle({
        openGameShareId: openGameId,
        actorUserId,
        status: casualStatus,
        lobbyId: stringField(body.lobbyId),
        lobbyUrl: stringField(body.lobbyUrl),
        spectateUrl: stringField(body.spectateUrl),
        wayfinderMatchId: stringField(body.wayfinderMatchId),
        wayfinderGameId: stringField(body.wayfinderGameId),
        failureReason: stringField(body.failureReason),
        lifecycleIdempotencyKey: stringField(body.lifecycleIdempotencyKey),
        joinerPoolShareId: stringField(body.joinerPoolShareId),
      })

      if (!result.duplicate) {
        if (result.boardChanged) broadcastOpenGamesUpdate().catch(() => {})
        emitOpenGameEventToUser(result.player1Id, casualStatus, { shareId: result.shareId })
        if (result.player2Id) {
          emitOpenGameEventToUser(result.player2Id, casualStatus, { shareId: result.shareId })
        }
      }
      return jsonResponse(result)
    }

    // The Swiss Practice variant stays STRICTLY server-to-server: a session
    // cookie is never enough here (only the casual seat-gated path above).
    if (actorUserId) {
      return errorResponse('Unauthorized', 401)
    }

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

    // Always push, not just on a row-level change. A lobby_ready for a new or
    // remade lobby must reach the opponent's Play button immediately — including
    // the cases where the targeted row didn't "change" (a deduped re-report, or
    // the lobby landing on a sibling game). Lifecycle events are infrequent
    // (a handful per game), so an occasional redundant broadcast is cheap
    // insurance against a stale lobby link that only a manual refresh fixes.
    await broadcastDraftState(result.shareId)

    return jsonResponse(result)
  } catch (error) {
    if (error instanceof OpenGameLiveError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status)
    }

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
