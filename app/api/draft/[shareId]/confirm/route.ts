// POST /api/draft/:shareId/confirm - Commit the player's staged selection
//
// The second half of the two-step pick. Clicking a card stages it (see
// select/route.ts); this locks it in. The round only advances once every
// player is confirmed, which is what gives a player drafting against bots a
// real window to change their mind — bots stage and confirm in one write, so
// without this step the human's first click ended the round instantly.
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { processAllStagedPicks } from '@/src/utils/draftAdvance'
import { processBotTurns } from '@/src/utils/botLogic'
import { checkAndEnforceTimeout } from '@/src/utils/draftTimeout'
import { confirmSelection, markLastPlayerStartIfNeeded } from '@/src/utils/draftSelection'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    const pod = await queryRow(
      `SELECT id, share_id, status FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.status !== 'active') {
      return errorResponse('Draft is not active', 400)
    }

    // Enforce timeouts first, exactly as the select route does — a confirmation
    // that arrives after the clock ran out must not be applied to a round that
    // has already rotated.
    const podId = pod.id as string
    const timeoutEnforced = await checkAndEnforceTimeout(podId)
    if (timeoutEnforced) {
      broadcastDraftState(shareId).catch(err => {
        console.error('Error broadcasting after timeout:', err)
      })
      return errorResponse('Draft state changed, please refresh', 409)
    }

    const player = await queryRow(
      'SELECT id FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [podId, session.id]
    )

    if (!player) {
      return errorResponse('Not in this draft', 400)
    }

    // Guarded on the row still holding a staged selection, so this can't
    // confirm a card the player no longer has staged.
    const confirmed = await confirmSelection(player.id as string)
    if (!confirmed) {
      broadcastDraftState(shareId).catch(err => {
        console.error('Error broadcasting after stale confirmation:', err)
      })
      return errorResponse('Draft state changed, please refresh', 409)
    }

    // Confirming can leave exactly one unresolved picker — start their clock.
    await markLastPlayerStartIfNeeded(podId)

    await query(
      'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
      [podId]
    )

    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    // Everyone confirmed? Process the round. processAllStagedPicks serializes
    // per-pod via pg_advisory_xact_lock and re-checks under the lock, so a
    // concurrent caller simply waits and then no-ops.
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

    return jsonResponse({ message: 'Selection confirmed' })
  } catch (error) {
    return handleApiError(error)
  }
}
