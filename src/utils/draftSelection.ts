/**
 * Draft Selection Staging
 *
 * The write half of the staged-pick system: a player stages a selection, and
 * when everyone has staged one `processAllStagedPicks` turns them into picks.
 *
 * Both functions here exist because the staging write races against timeout
 * enforcement, which can rotate packs out from under an in-flight request:
 *
 * - `stageSelection` re-checks that the card is still in the player's pack in
 *   the same statement that writes the selection, so a selection can never be
 *   staged against a pack the player no longer holds.
 * - `markLastPlayerStartIfNeeded` records when a pod dropped to a single
 *   remaining picker. The client countdown and the server-side timeout both
 *   read `draft_state.lastPlayerStartedAt`, so every path that can leave one
 *   picker behind — a bot pick or a human selection — has to call this or the
 *   Last Player timer never starts.
 */

import { query } from '@/lib/db'

/** JSONB column holding the cards a player may currently select from. */
export type StagingSource = 'leaders' | 'current_pack'

/**
 * The column a selection is validated against for a given draft phase, or null
 * for phases where nothing is selectable.
 */
export function stagingSourceForPhase(phase: string | undefined): StagingSource | null {
  if (phase === 'leader_draft') return 'leaders'
  if (phase === 'pack_draft') return 'current_pack'
  return null
}

/**
 * Stage a player's selection, re-validating card availability atomically.
 *
 * Callers validate availability against their own snapshot first (for a useful
 * error message); this is the backstop that closes the window between that
 * read and this write. If timeout enforcement advanced the draft in between,
 * the card is gone from the live row and no update happens.
 *
 * @returns true if the selection was staged, false if the card is no longer
 *          available — the caller should tell the client to refresh.
 */
export async function stageSelection(
  playerId: string,
  cardId: string,
  source: StagingSource
): Promise<boolean> {
  // `source` is a closed union, never caller-supplied text — safe to inline.
  const result = await query(
    `UPDATE pod_players
     SET selected_card_id = $1,
         pick_status = 'selected'
     WHERE id = $2
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(${source}, '[]'::jsonb)) AS card
         WHERE COALESCE(card->>'instanceId', card->>'id') = $1
       )`,
    [cardId, playerId]
  )

  return (result.rowCount ?? 0) > 0
}

/** Clear a player's staged selection, returning them to 'picking'. */
export async function clearSelection(playerId: string): Promise<void> {
  await query(
    `UPDATE pod_players
     SET selected_card_id = NULL,
         pick_status = 'picking'
     WHERE id = $1`,
    [playerId]
  )
}

/**
 * Record the moment a pod dropped to exactly one remaining picker.
 *
 * Idempotent and race-free: the "exactly one picker" test and the write happen
 * in one statement, and `jsonb_set` touches only that key, so it cannot clobber
 * a concurrent draft_state write the way a read-modify-write round trip could.
 * Cleared on round advance (see draftAdvance), which re-arms it for next round.
 */
export async function markLastPlayerStartIfNeeded(podId: string): Promise<void> {
  await query(
    `UPDATE pods
     SET draft_state = jsonb_set(
           COALESCE(draft_state, '{}'::jsonb),
           '{lastPlayerStartedAt}',
           to_jsonb($2::text),
           true
         )
     WHERE id = $1
       AND status = 'active'
       AND draft_state -> 'lastPlayerStartedAt' IS NULL
       AND (
         SELECT COUNT(*) FROM pod_players
         WHERE pod_id = $1 AND pick_status = 'picking'
       ) = 1`,
    [podId, new Date().toISOString()]
  )
}
