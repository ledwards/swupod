/**
 * Draft Selection Staging
 *
 * The write half of the staged-pick system. Picking is two steps: a player
 * stages a selection (which they can still change), then confirms it. Only
 * confirmed selections count — `processAllStagedPicks` turns them into picks
 * once every player is confirmed. Bots stage and confirm in one write, so a
 * solo-vs-bots draft still gives the human a real window to change their mind
 * instead of advancing on their first click.
 *
 * Both functions here exist because the staging write races against timeout
 * enforcement, which can rotate packs out from under an in-flight request:
 *
 * - `stageSelection` re-checks that the card is still in the player's pack in
 *   the same statement that writes the selection, so a selection can never be
 *   staged against a pack the player no longer holds.
 * - `markLastPlayerStartIfNeeded` records when a pod dropped to a single
 *   unresolved picker (still choosing, or staged but not yet confirmed). The
 *   client countdown and the server-side timeout both read
 *   `draft_state.lastPlayerStartedAt`, so every path that can leave one picker
 *   behind — a bot pick or a human selection — has to call this or the Last
 *   Player timer never starts.
 */

import { query } from '@/lib/db'

/**
 * SQL predicate for "this player still owes the round an answer" — they are
 * choosing, or they have staged a card but not confirmed it. Both halves of
 * the two-step pick block the round, so every "is anyone left?" query has to
 * use this rather than testing pick_status = 'picking' alone.
 */
export const UNRESOLVED_SQL =
  `(pick_status = 'picking' OR (pick_status = 'selected' AND selection_confirmed = false))`

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
 * Staging never confirms: `selection_confirmed` is written false so a restaged
 * pick can't inherit a previous confirmation. Bots pass confirmed = true to
 * stage and commit in one write.
 *
 * @returns true if the selection was staged, false if the card is no longer
 *          available — the caller should tell the client to refresh.
 */
export async function stageSelection(
  playerId: string,
  cardId: string,
  source: StagingSource,
  confirmed: boolean = false
): Promise<boolean> {
  // `source` is a closed union, never caller-supplied text — safe to inline.
  const result = await query(
    `UPDATE pod_players
     SET selected_card_id = $1,
         pick_status = 'selected',
         selection_confirmed = $3
     WHERE id = $2
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(${source}, '[]'::jsonb)) AS card
         WHERE COALESCE(card->>'instanceId', card->>'id') = $1
       )`,
    [cardId, playerId, confirmed]
  )

  return (result.rowCount ?? 0) > 0
}

/** Clear a player's staged selection, returning them to 'picking'. */
export async function clearSelection(playerId: string): Promise<void> {
  await query(
    `UPDATE pod_players
     SET selected_card_id = NULL,
         pick_status = 'picking',
         selection_confirmed = false
     WHERE id = $1`,
    [playerId]
  )
}

/**
 * Commit a player's staged selection — the second half of the two-step pick.
 *
 * Guarded on the row still holding a staged selection so a confirmation that
 * arrives after the round rotated (timeout enforcement, another client) can
 * never confirm a card the player no longer has staged.
 *
 * @returns true if the selection was confirmed, false if there was nothing
 *          staged to confirm — the caller should tell the client to refresh.
 */
export async function confirmSelection(playerId: string): Promise<boolean> {
  const result = await query(
    `UPDATE pod_players
     SET selection_confirmed = true
     WHERE id = $1
       AND pick_status = 'selected'
       AND selected_card_id IS NOT NULL`,
    [playerId]
  )

  return (result.rowCount ?? 0) > 0
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
         WHERE pod_id = $1 AND ${UNRESOLVED_SQL}
       ) = 1`,
    [podId, new Date().toISOString()]
  )
}
