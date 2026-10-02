/** Mirrors the deck builder's competitive-event edit lock, including child builds. */
export function entryDeckLocked(row: Record<string, unknown>, now = Date.now()): boolean {
  if (!row.competitive || row.decks_unlocked || row.parent_pool_id) return false
  const state =
    typeof row.draft_state === 'string'
      ? JSON.parse(row.draft_state)
      : (row.draft_state as { matchmakingStatus?: string } | null)
  const status = state?.matchmakingStatus ?? 'deck_building'
  const ended =
    status === 'complete' || now - new Date(String(row.created_at)).getTime() >= 7 * 86400000
  return (
    !ended &&
    (status === 'active' ||
      (!!row.deck_lock_at && new Date(String(row.deck_lock_at)).getTime() <= now))
  )
}
