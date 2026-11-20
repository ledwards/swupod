import type { RawCard } from '../../utils/cardData'

/**
 * A leader only shows up in a draft pack when its set has no leader slot
 * (Icons) — every other pack's leader goes to the leader draft. A deck plays
 * one leader, so once a bot already has one, a pack leader is worth less than
 * a playable card: bots take it at this fraction of its normal score.
 */
export const PACK_LEADER_VALUE = 0.5

/**
 * Discount a pack leader's pick score. A bot with no leader at all values it
 * fully, so an all-Icons draft does not leave bots unable to build a deck.
 */
export function discountPackLeader(
  card: RawCard,
  score: number,
  draftedLeaders: RawCard[],
  draftedCards: RawCard[]
): number {
  if (!card.isLeader) return score
  const hasLeader = draftedLeaders.length > 0 || draftedCards.some(c => c.isLeader)
  if (!hasLeader) return score
  return score > 0 ? score * PACK_LEADER_VALUE : score
}
