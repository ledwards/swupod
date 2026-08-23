/**
 * Who may see which leader a player has locked in.
 *
 * During the pack draft the seat panels list each player's drafted leaders. If
 * the one they have made active is drawn any differently from the rest — brighter,
 * first, undimmed — the panel has told the table which leader that player is
 * building towards. That is theirs to disclose, not the UI's.
 *
 * So the highlight is opt-in: the seat's own owner sees it (it is their own
 * information), and the post-draft report shows everything because by then every
 * pool is public. Everywhere else the leaders come back as one undifferentiated
 * list, on equal footing.
 */

export interface RevealableLeader {
  name: string
}

export interface LeaderRevealInput<T extends RevealableLeader> {
  /** Every leader this player has drafted. */
  draftedLeaders: readonly T[] | null | undefined
  /** The leader they have made active, if any. */
  activeLeaderName?: string | null
  /**
   * Whether this viewer is entitled to see the choice: the seat's own owner, or
   * any viewer of a surface where the pools are already public.
   */
  reveal: boolean
}

export interface LeaderRevealResult<T extends RevealableLeader> {
  /** The active leader, drawn as the choice — null whenever it must stay private. */
  chosenLeader: T | null
  /** Everything else, drawn on equal footing. Holds ALL leaders when hidden. */
  otherLeaders: T[]
}

/**
 * Split a player's drafted leaders into "the one they chose" and the rest,
 * collapsing to a single equal list when the viewer may not see the choice.
 *
 * @param input - The leaders, the active name, and whether the viewer may see it
 */
export function splitDraftedLeaders<T extends RevealableLeader>({
  draftedLeaders,
  activeLeaderName,
  reveal,
}: LeaderRevealInput<T>): LeaderRevealResult<T> {
  const leaders = draftedLeaders ?? []
  if (!reveal || !activeLeaderName) {
    return { chosenLeader: null, otherLeaders: [...leaders] }
  }

  let chosenLeader: T | null = null
  const otherLeaders: T[] = []
  for (const leader of leaders) {
    // First match only: a pool can legitimately hold two copies of a leader.
    if (!chosenLeader && leader.name === activeLeaderName) {
      chosenLeader = leader
      continue
    }
    otherLeaders.push(leader)
  }
  return { chosenLeader, otherLeaders }
}
