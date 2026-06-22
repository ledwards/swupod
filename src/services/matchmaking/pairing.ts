export interface PairingPlayer {
  id: string
  seatNumber: number
  matchWins: number
  matchLosses: number
  hasBye: boolean
  dropped: boolean
  opponents: string[]  // IDs of previous opponents
}

export interface Pairing {
  player1Id: string
  player2Id: string | null  // null = bye
  isBye: boolean
}

export function assignBye(players: PairingPlayer[]): string {
  const eligible = players.filter(p => !p.dropped && !p.hasBye)

  if (eligible.length > 0) {
    const minWins = Math.min(...eligible.map(p => p.matchWins))
    const lowestEligible = eligible.filter(p => p.matchWins === minWins)
    const first = lowestEligible[0]
    if (!first) throw new Error('assignBye: no eligible player found')
    return first.id
  }

  // Fall back: lowest-ranked active player (regardless of hasBye)
  const active = players.filter(p => !p.dropped)
  const minWins = Math.min(...active.map(p => p.matchWins))
  const lowest = active.filter(p => p.matchWins === minWins)
  const first = lowest[0]
  if (!first) throw new Error('assignBye: no active player found')
  return first.id
}

export function pairRound1(players: PairingPlayer[]): Pairing[] {
  const sorted = [...players].sort((a, b) => a.seatNumber - b.seatNumber)
  const n = sorted.length
  const half = Math.floor(n / 2)
  const pairings: Pairing[] = []

  for (let i = 0; i < half; i++) {
    const p1 = sorted[i]!
    const p2 = sorted[i + half]!

    const p1Dropped = p1.dropped
    const p2Dropped = p2.dropped

    // Both dropped: skip entirely
    if (p1Dropped && p2Dropped) continue

    // One dropped: the other gets a bye
    if (p1Dropped) {
      pairings.push({ player1Id: p2.id, player2Id: null, isBye: true })
    } else if (p2Dropped) {
      pairings.push({ player1Id: p1.id, player2Id: null, isBye: true })
    } else {
      pairings.push({ player1Id: p1.id, player2Id: p2.id, isBye: false })
    }
  }

  return pairings
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = result[i] as T
    result[i] = result[j] as T
    result[j] = tmp
  }
  return result
}

// Penalty applied to a pairing that repeats a prior matchup. It dwarfs any
// possible accumulated score-distance cost (wins are bounded by the round count,
// so per-pair score cost is tiny), guaranteeing the matcher only ever produces a
// rematch when NO rematch-free perfect matching exists.
const REMATCH_PENALTY = 1_000_000

function pairCost(a: PairingPlayer, b: PairingPlayer): number {
  const isRematch = a.opponents.includes(b.id) || b.opponents.includes(a.id)
  const winDistance = a.matchWins - b.matchWins
  // Squared score distance keeps players paired within their score group and,
  // when a pair-down is forced, prefers the smallest drop in the standings.
  return (isRematch ? REMATCH_PENALTY : 0) + winDistance * winDistance
}

/**
 * Exact minimum-cost perfect matching over an even-sized set of players.
 *
 * Swiss pairing must never repeat a matchup while a rematch-free pairing is
 * still possible, even when avoiding the rematch requires pairing a player DOWN
 * into a lower score group. A greedy "pair within the score group, float the
 * leftover down" approach can strand a player into a rematch because it commits
 * to local pairings before seeing the downstream consequence. Pods are tiny
 * (<= 8 players), so we instead solve it exactly: every avoided rematch saves
 * REMATCH_PENALTY, which no amount of score-distance cost can outweigh, so the
 * minimum-cost matching is rematch-free whenever one exists, and otherwise uses
 * the fewest rematches. Among equal-cost matchings the secondary score-distance
 * term reproduces standard Swiss behaviour (pair within group, pair down least).
 *
 * O(2^n) with memoization on the remaining-player bitmask — trivial for n <= 8.
 */
function minCostMatching(players: PairingPlayer[]): Pairing[] {
  const n = players.length
  if (n === 0) return []

  const memo = new Map<number, { cost: number, pairs: Array<[number, number]> }>()

  function solve(mask: number): { cost: number, pairs: Array<[number, number]> } {
    if (mask === 0) return { cost: 0, pairs: [] }
    const cached = memo.get(mask)
    if (cached) return cached

    // Match the lowest-index unmatched player against every possible partner.
    let i = 0
    while ((mask & (1 << i)) === 0) i++

    let best: { cost: number, pairs: Array<[number, number]> } | null = null
    for (let j = i + 1; j < n; j++) {
      if ((mask & (1 << j)) === 0) continue
      const rest = mask & ~(1 << i) & ~(1 << j)
      const sub = solve(rest)
      const total = pairCost(players[i]!, players[j]!) + sub.cost
      if (!best || total < best.cost) {
        best = { cost: total, pairs: [[i, j], ...sub.pairs] }
      }
    }

    const result = best!
    memo.set(mask, result)
    return result
  }

  const { pairs } = solve((1 << n) - 1)
  return pairs.map(([i, j]) => ({
    player1Id: players[i]!.id,
    player2Id: players[j]!.id,
    isBye: false,
  }))
}

export function pairSwiss(players: PairingPlayer[]): Pairing[] {
  const active = players.filter(p => !p.dropped)
  const pairings: Pairing[] = []

  // Shuffle once so that, among equally-valid (same-cost) matchings, the chosen
  // pairing varies between rounds rather than always following seat order.
  let remaining = shuffle(active)

  // Assign bye if odd number of active players
  if (remaining.length % 2 !== 0) {
    const byePlayerId = assignBye(remaining)
    pairings.push({ player1Id: byePlayerId, player2Id: null, isBye: true })
    remaining = remaining.filter(p => p.id !== byePlayerId)
  }

  // Exact minimum-cost matching: pairs within score groups and never repeats a
  // matchup unless every possible pairing of the remaining players would.
  pairings.push(...minCostMatching(remaining))

  return pairings
}
