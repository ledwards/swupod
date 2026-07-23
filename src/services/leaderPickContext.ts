/**
 * Leader pick CONTEXT stats — the "picked over other strong leaders" view.
 *
 * A draft leader is chosen from a fresh 3-leader opening pack (the leaders dealt
 * to a seat). The round-1 pick is the leader taken OVER the other leaders in that
 * same opening. Aggregating those head-to-heads answers Troy's question: "how
 * often is this leader picked over the others it was offered alongside?" — which
 * plain first-pick rate can't, because it ignores *which* alternatives were present.
 *
 * Pure: callers extract the openings (leader identities + the round-1 pick) from
 * pods.all_leader_packs + draft_picks and pass them in. No I/O here.
 */

export interface SeatOpening {
  /** Leader identities in the fresh round-1 pack (name or name|subtitle key). */
  openingLeaders: string[]
  /** The leader taken at round 1 (must be one of openingLeaders), or null if unknown. */
  firstPick: string | null
}

export interface LeaderRival {
  rival: string
  /** Openings where both this leader and the rival were offered together. */
  coOpenings: number
  /** Of those, times THIS leader was the round-1 pick. */
  pickedOver: number
  /** Of those, times the RIVAL was the round-1 pick. */
  pickedUnder: number
  /**
   * Head-to-head preference: pickedOver / (pickedOver + pickedUnder) — i.e. when
   * one of the two is taken first, how often it's this leader. null when neither
   * was ever the first pick in a shared opening (a third leader always won).
   */
  chosenOverRate: number | null
}

export interface LeaderContextStats {
  leader: string
  /** Times this leader appeared in a fresh opening pack. */
  openings: number
  /** Times it was the round-1 pick. */
  firstPicks: number
  /** firstPicks / openings — first-pick rate, recomputed from openings. */
  firstPickRate: number
  /** Rivals it shared openings with, most-contested first. */
  rivals: LeaderRival[]
}

interface Agg {
  leader: string
  openings: number
  firstPicks: number
  rivals: Map<string, { coOpenings: number; pickedOver: number; pickedUnder: number }>
}

/**
 * Aggregate per-leader opening context.
 *
 * @param openings one entry per (pod, seat) fresh opening pack.
 */
export function computeLeaderContextStats(openings: SeatOpening[]): LeaderContextStats[] {
  const byLeader = new Map<string, Agg>()

  const ensure = (leader: string): Agg => {
    let a = byLeader.get(leader)
    if (!a) {
      a = { leader, openings: 0, firstPicks: 0, rivals: new Map() }
      byLeader.set(leader, a)
    }
    return a
  }

  for (const opening of openings) {
    // Dedupe within an opening so a (bad) duplicate can't double-count a rivalry.
    const leaders = Array.from(new Set(opening.openingLeaders))
    if (leaders.length === 0) continue
    const firstPick = opening.firstPick

    for (const leader of leaders) {
      const a = ensure(leader)
      a.openings++
      if (firstPick === leader) a.firstPicks++
    }

    // Record every unordered pair's head-to-head from this opening.
    for (let i = 0; i < leaders.length; i++) {
      for (let j = i + 1; j < leaders.length; j++) {
        const l1 = leaders[i]!
        const l2 = leaders[j]!
        const a1 = ensure(l1)
        const a2 = ensure(l2)
        const r1 = a1.rivals.get(l2) ?? { coOpenings: 0, pickedOver: 0, pickedUnder: 0 }
        const r2 = a2.rivals.get(l1) ?? { coOpenings: 0, pickedOver: 0, pickedUnder: 0 }
        r1.coOpenings++
        r2.coOpenings++
        if (firstPick === l1) { r1.pickedOver++; r2.pickedUnder++ }
        else if (firstPick === l2) { r1.pickedUnder++; r2.pickedOver++ }
        // else: a third leader in the opening was taken first — a shared "pass",
        // counted as a co-opening but neither a win nor a loss for this pair.
        a1.rivals.set(l2, r1)
        a2.rivals.set(l1, r2)
      }
    }
  }

  const result: LeaderContextStats[] = []
  for (const a of byLeader.values()) {
    const rivals: LeaderRival[] = Array.from(a.rivals.entries())
      .map(([rival, r]) => {
        const decided = r.pickedOver + r.pickedUnder
        return {
          rival,
          coOpenings: r.coOpenings,
          pickedOver: r.pickedOver,
          pickedUnder: r.pickedUnder,
          chosenOverRate: decided > 0 ? r.pickedOver / decided : null,
        }
      })
      .sort((x, y) => y.coOpenings - x.coOpenings || x.rival.localeCompare(y.rival))

    result.push({
      leader: a.leader,
      openings: a.openings,
      firstPicks: a.firstPicks,
      firstPickRate: a.openings > 0 ? a.firstPicks / a.openings : 0,
      rivals,
    })
  }

  return result.sort((x, y) => y.firstPickRate - x.firstPickRate || y.openings - x.openings)
}
