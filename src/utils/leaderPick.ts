import { cardIdentityKey } from './cardNormalization'

type Leader = { id: string; instanceId?: string; name: string; type?: string; subtitle?: string | null }

/** Whether a staged selection names a leader in this pack (by instance, or by id for cards without one). */
export function leaderMatches(leader: Leader, cardId: string | null | undefined): boolean {
  if (!cardId) return false
  return leader.instanceId ? leader.instanceId === cardId : leader.id === cardId
}

/**
 * The leader a drafter takes from the pack in front of them. Every drafter
 * leaves the leader draft with one leader per round, so a pick never vanishes:
 * a selection that is not in this pack (staged against the pack before it
 * rotated) falls back to the first leader they do not already own, and to a
 * duplicate only when nothing else is left. -1 only for an empty pack.
 */
export function resolveLeaderPick(leaders: Leader[], cardId: string | null | undefined, drafted: Leader[]): number {
  if (!leaders.length) return -1
  const chosen = leaders.findIndex(l => leaderMatches(l, cardId))
  if (chosen >= 0) return chosen
  const owned = new Set(drafted.map(l => cardIdentityKey(l)))
  const fresh = leaders.findIndex(l => !owned.has(cardIdentityKey(l)))
  return fresh >= 0 ? fresh : 0
}
