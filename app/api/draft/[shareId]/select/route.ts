// POST /api/draft/:shareId/select - Stage a selection (not a final pick)
// Selection is stored temporarily until all players have selected
// When all have selected, picks are processed automatically
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { processAllStagedPicks } from '@/src/utils/draftAdvance'
import { processBotTurns } from '@/src/utils/botLogic'
import { checkAndEnforceTimeout } from '@/src/utils/draftTimeout'
import {
  stageSelection,
  clearSelection,
  stagingSourceForPhase,
  markLastPlayerStartIfNeeded,
} from '@/src/utils/draftSelection'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)
    const body = await parseBody(request)

    const cardId = (body as { cardId?: string | null }).cardId ?? null // null to unselect

    // Get draft pod (exclude all_packs to save memory)
    const pod = await queryRow(
      `SELECT id, share_id, status, draft_state, state_version, host_id
       FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.status !== 'active') {
      return errorResponse('Draft is not active', 400)
    }

    // Check and enforce timeouts before validating selection
    // This ensures we're working with current state (leaders/packs may have rotated)
    const podId = pod.id as string
    const timeoutEnforced = await checkAndEnforceTimeout(podId)
    if (timeoutEnforced) {
      // State changed - broadcast update and return error so client can refresh
      broadcastDraftState(shareId).catch(err => {
        console.error('Error broadcasting after timeout:', err)
      })
      return errorResponse('Draft state changed, please refresh', 409)
    }

    // Get current player
    const player = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [podId, session.id]
    )

    if (!player) {
      return errorResponse('Not in this draft', 400)
    }

    // Parse draft state
    const draftState = typeof pod.draft_state === 'string'
      ? JSON.parse(pod.draft_state)
      : pod.draft_state

    // Validate the card is available (if selecting, not unselecting)
    if (cardId) {
      if (draftState.phase === 'leader_draft') {
        const leaders = typeof player.leaders === 'string'
          ? JSON.parse(player.leaders)
          : player.leaders || []

        type CardRef = { instanceId?: string; id?: string; name?: string }
        const leaderExists = (leaders as CardRef[]).some(l =>
          (l.instanceId && l.instanceId === cardId) || (!l.instanceId && l.id === cardId)
        )
        if (!leaderExists) {
          // Debug: log what we have vs what was requested
          console.error('[SELECT] Leader not available:', {
            cardId,
            leadersCount: leaders.length,
            leaderIds: (leaders as CardRef[]).slice(0, 5).map(l => ({ id: l.id, instanceId: l.instanceId, name: l.name })),
            playerId: player.id,
            pickStatus: player.pick_status,
            rawLeaders: typeof player.leaders === 'string' ? 'string' : 'object'
          })
          return errorResponse('Leader not available', 400)
        }
      } else if (draftState.phase === 'pack_draft') {
        const currentPack = typeof player.current_pack === 'string'
          ? JSON.parse(player.current_pack)
          : player.current_pack || []

        type PackCardRef = { instanceId?: string; id?: string }
        const cardExists = (currentPack as PackCardRef[]).some(c =>
          (c.instanceId && c.instanceId === cardId) || (!c.instanceId && c.id === cardId)
        )
        if (!cardExists) {
          return errorResponse('Card not available', 400)
        }
      }
    }

    // Update player's selection (temporary, not a final pick).
    // The validation above ran against a snapshot read before this write; if a
    // timeout advanced the draft in between, the pack has rotated and the card
    // is gone. stageSelection re-checks availability in the same statement, so
    // a selection can never be staged against a pack we no longer hold — which
    // would otherwise be silently dropped by processAllStagedPicks, costing the
    // player their pick and leaving the pack one card oversized.
    const playerId = player.id as string
    const stagingSource = cardId ? stagingSourceForPhase(draftState.phase) : null
    if (cardId && stagingSource) {
      const staged = await stageSelection(playerId, cardId, stagingSource)
      if (!staged) {
        broadcastDraftState(shareId).catch(err => {
          console.error('Error broadcasting after stale selection:', err)
        })
        return errorResponse('Draft state changed, please refresh', 409)
      }
    } else if (cardId) {
      // Phase has nothing selectable (nothing to validate against) — preserve
      // the historical write rather than rejecting.
      await query(
        `UPDATE pod_players SET selected_card_id = $1, pick_status = 'selected' WHERE id = $2`,
        [cardId, playerId]
      )
    } else {
      await clearSelection(playerId)
    }

    // If that left exactly one player still picking, start the Last Player
    // timer. Bot picks do this too — without it here, the timer never engages
    // in an all-human pod and the server has nothing to enforce.
    await markLastPlayerStartIfNeeded(podId)

    // Increment state version so other clients see the update
    await query(
      'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
      [podId]
    )

    // Broadcast state update immediately so clients see the selection
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    // Check if all players have now selected - if so, process picks immediately
    // This handles the case of all-human drafts without relying on bot processing.
    // processAllStagedPicks serializes per-pod via pg_advisory_xact_lock and
    // re-checks "all selected" under the lock, so a concurrent caller simply
    // waits and then no-ops — no retry loop or soft lock needed.
    if (cardId) {
      try {
        const processed = await processAllStagedPicks(podId)
        if (processed) {
          // Broadcast after picks processed so clients see the advanced state
          await broadcastDraftState(shareId)
        }
      } catch (err) {
        console.error('Error processing picks:', err)
      }

      // Trigger bot processing for drafts with bots
      // Don't await - let it run in background so response is fast
      processBotTurns(podId).catch(err => {
        console.error('Error processing bot turns:', err)
      })
    }

    return jsonResponse({ message: cardId ? 'Card selected' : 'Selection cleared' })
  } catch (error) {
    return handleApiError(error)
  }
}
