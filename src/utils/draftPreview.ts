/**
 * Leader Preview Phase
 *
 * The lobby "Ready" (POST /start) deals packs into the 'leader_preview' phase:
 * every seat's leader pack is revealed around the table, but nobody can pick,
 * `pick_started_at` is NULL and every seat sits at pick_status = 'waiting'.
 * The host opens picking with Start Draft (POST /begin-picking).
 *
 * **A draft never starts picking without the host.** Nothing in this module —
 * or anywhere else — performs that transition on its own; beginPickingTransition
 * has exactly one caller, the host-only route.
 *
 * What the split does need is an exit for a pod the host abandons after hitting
 * Ready. Nothing else can advance it (the pick-timer sweep needs
 * `pick_started_at`, bots need pick_status='picking'), so it would otherwise sit
 * there forever. Two things handle that, neither of which touches the draft
 * itself: players can leave during the preview (POST /leave), and a pod still
 * sitting on the preview a full day later is CANCELLED — the same teardown the
 * host's own Cancel Draft performs.
 */

import { queryRow, queryRows, withTransaction } from '@/lib/db'
import { processBotTurns } from './botLogic'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { cancelDraftPod } from './podCleanup'
import { jsonParse } from './json'

/**
 * How long a draft may sit on the leader preview before it is cancelled
 * outright. Deliberately far beyond any real session: this is garbage
 * collection for a pod whose host walked away, not a pacing mechanism, and it
 * must never fire on a table that is genuinely still deciding.
 */
export const LEADER_PREVIEW_CANCEL_AFTER_SECONDS = 24 * 60 * 60

/** Cap on pods cancelled per sweep, so one pass can never run unbounded. */
const SWEEP_POD_LIMIT = 200

/** System chat line for a preview nobody ever started. */
export const STALLED_PREVIEW_CANCEL_MESSAGE =
  '❌ This draft was cancelled automatically — it sat on the leader preview for over 24 hours without starting.'

/**
 * Build the next draft_state for the transition, preserving every other key
 * (leaderRound, totalPacks, packNumber, ...). The preview start time is dropped
 * — it only means anything while the phase is 'leader_preview'.
 *
 * @param draftState - The pod's current draft_state
 * @returns A new draft_state object; the input is not mutated
 */
export function buildBeginPickingDraftState(
  draftState: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...draftState, phase: 'leader_draft' }
  delete next.previewStartedAt
  return next
}

/**
 * Perform the 'leader_preview' → 'leader_draft' transition for one pod: open
 * picking, start the pick timer, run bots, broadcast.
 *
 * HOST ONLY. The single caller is POST /api/draft/:shareId/begin-picking, which
 * rejects anyone but the host. Nothing on a timer or a sweep may call this — a
 * draft must never start picking without the host.
 *
 * Atomic and idempotent. Everything happens in one transaction, the pod row is
 * taken FOR UPDATE, and the phase flip is *additionally* guarded on the phase
 * in SQL — so of two overlapping calls (a host with two tabs) exactly one does
 * the work and the loser is a no-op. That matters beyond tidiness: an
 * unconditional `pick_status = 'picking'` from a second caller would reset seats
 * the first caller's bots had already moved to 'selected' while leaving
 * `selected_card_id` populated, and the round would stall until the pick timer
 * bailed it out.
 *
 * @param podId - Draft pod ID
 * @param shareId - Draft share ID (for the socket broadcast)
 * @returns true if this call performed the transition, false if it was already
 *          done (or the pod is no longer an active preview)
 */
export async function beginPickingTransition(podId: string, shareId: string): Promise<boolean> {
  const transitioned = await withTransaction(async (tx) => {
    // FOR UPDATE serializes concurrent callers on the pod row; the loser wakes
    // up after the winner commits and reads a pod already in 'leader_draft'.
    const pod = await tx.queryRow(
      `SELECT id, draft_state FROM pods
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [podId]
    )
    if (!pod) return false

    const draftState = jsonParse<Record<string, unknown>>(
      pod.draft_state as string | Record<string, unknown> | null,
      {}
    ) as Record<string, unknown>
    if (draftState.phase !== 'leader_preview') return false

    const nextDraftState = buildBeginPickingDraftState(draftState)

    // Flip the phase and start the pick timer. Bumping state_version is
    // CRITICAL: useDraftSocket only re-fetches private data (leaders /
    // currentPack) when stateVersion increases.
    const flipped = await tx.query(
      `UPDATE pods
       SET draft_state = $1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0,
           state_version = state_version + 1
       WHERE id = $2
         AND draft_state->>'phase' = 'leader_preview'`,
      [JSON.stringify(nextDraftState), podId]
    )
    if (flipped.rowCount === 0) return false

    // Open picking for everyone (bots included — processBotTurns picks for
    // them). Guarded on 'waiting' so this can only ever open seats /start
    // parked, never reset one that has already selected.
    await tx.query(
      `UPDATE pod_players SET pick_status = 'picking'
       WHERE pod_id = $1 AND pick_status = 'waiting'`,
      [podId]
    )

    return true
  })

  if (!transitioned) return false

  // Trigger bot picks in the background
  processBotTurns(podId).catch(err => {
    console.error('Error processing bot turns after begin-picking:', err)
  })

  // Broadcast the phase change to all connected clients
  broadcastDraftState(shareId).catch(err => {
    console.error('Error broadcasting draft state:', err)
  })

  return true
}

/**
 * Cancel every draft still sitting on the leader preview more than
 * LEADER_PREVIEW_CANCEL_AFTER_SECONDS after it was dealt.
 *
 * This is the only automatic exit from the phase, and it never starts the
 * draft — the host is the only thing that can do that. Cancellation runs
 * through cancelDraftPod, the same teardown as the host's Cancel Draft, so
 * connected clients get the same 'deleted' event and chat/Discord get the same
 * notices.
 *
 * Paused pods are deliberately NOT skipped: pausing is no reason a pod should
 * outlive a full day of inactivity, and exempting them would make pause a way
 * to leak pods forever. (The pick-timer sweep skips paused pods because it
 * forces picks on live players; this one only reaps dead pods.)
 *
 * Called on an interval by server.ts. Each pod is cancelled independently so
 * one bad pod cannot stall the sweep.
 *
 * @returns how many pods were cancelled
 */
export async function sweepStalledLeaderPreviews(): Promise<number> {
  // previewStartedAt is missing on pods dealt before it was recorded, so fall
  // back to started_at — POST /start sets it to NOW() in the same statement
  // that enters 'leader_preview' and nothing else in the app writes it — then
  // created_at as a last resort.
  const pods = await queryRows(
    `SELECT id, share_id, host_id FROM pods
     WHERE status = 'active'
       AND draft_state->>'phase' = 'leader_preview'
       AND COALESCE(
             (draft_state->>'previewStartedAt')::timestamptz,
             started_at,
             created_at
           ) <= NOW() - ($1 || ' seconds')::interval
     ORDER BY created_at
     LIMIT $2`,
    [String(LEADER_PREVIEW_CANCEL_AFTER_SECONDS), SWEEP_POD_LIMIT]
  )

  let cancelled = 0
  for (const pod of pods) {
    try {
      const host = await queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id])
      const wasCancelled = await cancelDraftPod(
        pod.id as string,
        (host?.username as string) || 'Host',
        STALLED_PREVIEW_CANCEL_MESSAGE
      )
      if (wasCancelled) cancelled++
    } catch (err) {
      console.error(`[LeaderPreview] Cancelling stalled pod ${pod.id} failed:`, err)
    }
  }

  return cancelled
}
