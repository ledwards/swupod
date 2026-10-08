const PACK_TIMEOUTS: Record<number, number> = {
  14: 60,
  13: 40,
  12: 40,
  11: 30,
  10: 30,
  9: 25,
  8: 25,
  7: 20,
  6: 15,
  5: 10,
  4: 10,
  3: 5,
  2: 5,
  1: 0,
}

const LEADER_TIMEOUTS: Record<number, number> = {
  3: 15,
  2: 10,
  1: 0,
}

export function getCompetitivePickTimeout(cardsRemaining: number): number {
  return PACK_TIMEOUTS[cardsRemaining] ?? 0
}

export function getLeaderPickTimeout(leadersRemaining: number): number {
  return LEADER_TIMEOUTS[leadersRemaining] ?? 0
}

/**
 * Review window competitive pods get between packs. The pick clock starts when
 * this closes, not when the pack is dealt — otherwise the review would eat half
 * of the first pick's allowance above.
 */
export const INTER_PACK_REVIEW_SECONDS = 30

/**
 * How long a forced auto-pick waits before it fires.
 *
 * When one card is left there is nothing to decide, so the schedule above gives
 * it a timeout of 0 and the sweep takes it. Taken literally that means the round
 * advances between frames: the last leader is dealt and gone before any client
 * has painted it, and from a player's seat a card they never saw is suddenly in
 * their pool.
 *
 * So the auto-pick still waits — long enough to read the card, short enough that
 * it plainly is not asking you to choose. No clock is shown during it, because a
 * countdown would imply a decision.
 */
export const AUTO_PICK_REVEAL_SECONDS = 2.5
