import { withTransaction } from '@/lib/db'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { checkAndAdvanceRoundInTransaction, type RoundAdvanceResult } from './advancement'

export interface DropPlayerParams {
  podId: string
  userId: string
  shareId: string
}

export interface DropPlayerResult {
  /** false when the player was already dropped (idempotent no-op). */
  dropped: boolean
  /** true when an in-progress, non-bye match was auto-resolved as a loss. */
  matchResolved: boolean
  /** Outcome of the round-advance check that runs after the auto-loss. */
  advanceResult: RoundAdvanceResult | null
}

/**
 * Remove a player from an in-progress Swiss Practice event. This is the single
 * shared core behind BOTH host-remove (boot) and player self-drop — they differ
 * only in their caller-side auth checks, never in what actually happens to the
 * event.
 *
 * Behavior (all in one transaction so the event can never observe a half-drop):
 * - Marks `pod_players.dropped = true, dropped_at = NOW()`. Idempotent: if the
 *   player is already dropped this is a complete no-op (nothing is re-resolved,
 *   so a double-drop or drop-then-boot never double-counts a loss).
 * - Auto-resolves the player's current unconfirmed, non-bye match as a loss to
 *   the opponent (opponent recorded as the match winner). An existing bye win
 *   this round is left intact — a bye match is already final and is skipped.
 * - Voids any non-terminal live game rows for that match so a now-confirmed
 *   match never lingers as "in progress" in the read model (an orphaned live
 *   game from a Wayfinder launch must not block the round).
 * - Runs the round-advance check: if the auto-loss resolved the last unconfirmed
 *   match the round advances (or, on the final round, the event completes).
 *
 * The dropped player is excluded from all future pairings automatically —
 * `pairSwiss`/`createNextRound` filter on `pod_players.dropped`.
 */
export async function dropPlayerFromMatchmaking({
  podId,
  userId,
  shareId,
}: DropPlayerParams): Promise<DropPlayerResult> {
  const result = await withTransaction<DropPlayerResult>(async (tx) => {
    // Idempotency guard: only proceed if the player is currently active. The
    // conditional UPDATE returns no row when they were already dropped (or are
    // not in the pod), which makes a repeat drop / drop-after-boot a true no-op.
    const marked = await tx.queryRow(
      `UPDATE pod_players
       SET dropped = true, dropped_at = NOW()
       WHERE pod_id = $1 AND user_id = $2 AND dropped = false
       RETURNING user_id`,
      [podId, userId]
    )

    if (!marked) {
      return { dropped: false, matchResolved: false, advanceResult: null }
    }

    // Auto-resolve the dropper's current unconfirmed, non-bye match as a loss.
    // (final_confirmed = false already excludes their bye for this round, and
    // is_bye = false makes that intent explicit.)
    const resolvedMatches = await tx.queryRows(
      `UPDATE practice_matches
       SET final_confirmed = true,
           player1_submitted = true,
           player2_submitted = true,
           match_winner = CASE
             WHEN player1_id = $2 THEN 'player2'
             WHEN player2_id = $2 THEN 'player1'
           END
       WHERE pod_id = $1
         AND final_confirmed = false
         AND is_bye = false
         AND (player1_id = $2 OR player2_id = $2)
       RETURNING id`,
      [podId, userId]
    )

    // Void any non-terminal live game rows for the resolved match so the
    // confirmed match doesn't carry a phantom "in progress" game in the read
    // model. checkAndAdvanceRound only inspects practice_matches, so this is
    // cleanup — it never gates advancement.
    if (resolvedMatches.length > 0) {
      const matchIds = resolvedMatches.map((row) => row.id as string)
      await tx.query(
        `UPDATE practice_match_games
         SET status = 'voided'
         WHERE match_id = ANY($1::uuid[])
           AND status NOT IN ('complete', 'failed', 'voided')`,
        [matchIds]
      )
    }

    const advanceResult = await checkAndAdvanceRoundInTransaction(tx, podId)

    return {
      dropped: true,
      matchResolved: resolvedMatches.length > 0,
      advanceResult,
    }
  })

  await broadcastDraftState(shareId)

  return result
}
