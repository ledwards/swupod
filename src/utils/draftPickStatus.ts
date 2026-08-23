/**
 * Draft pick status — the client's view of "who is the round still waiting on?"
 *
 * Picking is two steps: clicking a card STAGES it (pick_status = 'selected'),
 * and confirming locks it in. Only a locked-in pick lets the round advance, so
 * every "is everyone done?" check in the draft UI has to ask for the
 * confirmation too. Treating a staged selection as done is what made the pack
 * jump to the passing skeleton — hiding the very confirm control the round was
 * waiting on.
 */

export interface PickStatusPlayer {
  pickStatus?: string
  /** A staged selection is tentative until the player confirms it. */
  selectionConfirmed?: boolean
}

/**
 * Has this player committed their pick for the current round?
 *
 * 'picked' means the round already processed their card. 'selected' only counts
 * once confirmed — before that the player can still swap or clear it.
 */
export function isPickLockedIn(player: PickStatusPlayer | null | undefined): boolean {
  if (!player) return false
  if (player.pickStatus === 'picked') return true
  return player.pickStatus === 'selected' && player.selectionConfirmed === true
}
