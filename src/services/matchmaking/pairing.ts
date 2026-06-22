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

function pairGroupGreedy(group: PairingPlayer[]): { pairings: Pairing[], leftover: PairingPlayer | null, rematches: number } {
  const pairings: Pairing[] = []
  const available = [...group]
  let rematches = 0

  while (available.length >= 2) {
    const player = available.shift()!
    const opponentIdx = available.findIndex(p => !player.opponents.includes(p.id) && !p.opponents.includes(player.id))

    if (opponentIdx !== -1) {
      const opponent = available.splice(opponentIdx, 1)[0]!
      pairings.push({ player1Id: player.id, player2Id: opponent.id, isBye: false })
    } else {
      // No valid opponent found (rematch unavoidable in this ordering)
      const opponent = available.shift()!
      pairings.push({ player1Id: player.id, player2Id: opponent.id, isBye: false })
      rematches += 1
    }
  }

  const leftover = available.length === 1 ? (available[0] ?? null) : null
  return { pairings, leftover, rematches }
}

function pairGroup(group: PairingPlayer[], previouslyPaired: Set<string>): { pairings: Pairing[], leftover: PairingPlayer | null } {
  // Greedy pairing on a shuffled group can produce rematches even when a
  // non-greedy ordering would avoid them. Try multiple shuffles and keep the
  // best (fewest rematches). Cap attempts so this stays O(N) for sane sizes.
  let best: { pairings: Pairing[], leftover: PairingPlayer | null, rematches: number } | null = null
  const maxAttempts = group.length <= 8 ? 50 : 10
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = pairGroupGreedy(i === 0 ? group : shuffle(group))
    if (!best || candidate.rematches < best.rematches) {
      best = candidate
      if (best.rematches === 0) break  // perfect — done
    }
  }

  if (!best) {
    return { pairings: [], leftover: null }
  }

  for (const pairing of best.pairings) {
    previouslyPaired.add(`${pairing.player1Id}:${pairing.player2Id}`)
  }

  return { pairings: best.pairings, leftover: best.leftover }
}

/** True if these two players have already faced each other. */
function isRematch(a: PairingPlayer, b: PairingPlayer): boolean {
  return a.opponents.includes(b.id) || b.opponents.includes(a.id)
}

/** Count rematches among a set of (non-bye) pairings. */
function countRematches(pairings: Pairing[], map: Map<string, PairingPlayer>): number {
  let n = 0
  for (const p of pairings) {
    if (p.isBye || !p.player2Id) continue
    const a = map.get(p.player1Id)
    const b = map.get(p.player2Id)
    if (a && b && isRematch(a, b)) n += 1
  }
  return n
}

/**
 * Enumerate every perfect matching of an even-sized list. Exhaustive — only
 * called for small N (caller caps at MAX_EXHAUSTIVE_PAIRING). 8 players → 105
 * matchings, 10 → 945; trivial.
 */
function allPerfectMatchings(players: PairingPlayer[]): Pairing[][] {
  if (players.length === 0) return [[]]
  const [first, ...rest] = players
  const out: Pairing[][] = []
  for (let i = 0; i < rest.length; i++) {
    const opp = rest[i]!
    const remaining = rest.filter((_, j) => j !== i)
    for (const sub of allPerfectMatchings(remaining)) {
      out.push([{ player1Id: first!.id, player2Id: opp.id, isBye: false }, ...sub])
    }
  }
  return out
}

const MAX_EXHAUSTIVE_PAIRING = 10

/**
 * Global pairing that minimizes rematches first, then keeps records as close as
 * possible (real Swiss prefers same/adjacent win-count pairings). Used as a
 * fallback when the win-group greedy pass is forced into an AVOIDABLE rematch —
 * e.g. a closed 2-player win-group whose only in-group opponent is a rematch,
 * while a cross-group pairing would avoid it. Returns null when N is odd or too
 * large to enumerate (caller keeps the greedy result then).
 */
function pairGlobalMinRematch(players: PairingPlayer[]): Pairing[] | null {
  if (players.length === 0) return []
  if (players.length % 2 !== 0) return null
  if (players.length > MAX_EXHAUSTIVE_PAIRING) return null
  const map = new Map(players.map(p => [p.id, p]))
  let best: Pairing[] | null = null
  let bestScore = Infinity
  for (const matching of allPerfectMatchings(players)) {
    const rematches = countRematches(matching, map)
    let winSpread = 0
    for (const p of matching) {
      const a = map.get(p.player1Id)!
      const b = map.get(p.player2Id!)!
      winSpread += Math.abs(a.matchWins - b.matchWins)
    }
    // Rematches dominate; record-closeness (winSpread) breaks ties so we still
    // pair like-record players when several zero-rematch matchings exist.
    const score = rematches * 1000 + winSpread
    if (score < bestScore) {
      bestScore = score
      best = matching
    }
  }
  return best
}

export function pairSwiss(players: PairingPlayer[]): Pairing[] {
  const active = players.filter(p => !p.dropped)
  const pairings: Pairing[] = []
  const previouslyPaired = new Set<string>()

  let remaining = [...active]

  // Assign bye if odd number of active players
  if (remaining.length % 2 !== 0) {
    const byePlayerId = assignBye(remaining)
    pairings.push({ player1Id: byePlayerId, player2Id: null, isBye: true })
    remaining = remaining.filter(p => p.id !== byePlayerId)
  }

  // Group by matchWins descending
  const winCounts = [...new Set(remaining.map(p => p.matchWins))].sort((a, b) => b - a)
  const groups: Map<number, PairingPlayer[]> = new Map()
  for (const wins of winCounts) {
    groups.set(wins, shuffle(remaining.filter(p => p.matchWins === wins)))
  }

  let floatDown: PairingPlayer | null = null

  for (const wins of winCounts) {
    const group = groups.get(wins)!
    if (floatDown) {
      group.unshift(floatDown)
      floatDown = null
    }

    const { pairings: groupPairings, leftover } = pairGroup(group, previouslyPaired)
    pairings.push(...groupPairings)
    floatDown = leftover
  }

  // If there's still a floatDown after all groups (shouldn't happen with even count, but safety net)
  if (floatDown) {
    pairings.push({ player1Id: floatDown.id, player2Id: null, isBye: true })
  }

  // Rematch-avoidance safety net. The win-group greedy pass only reshuffles
  // WITHIN a win-group, so a closed in-group rematch (e.g. two 2-0 players who
  // already played, with no third 2-0 player) is never resolved even though a
  // cross-group pairing would avoid it. When that happens, fall back to a global
  // minimum-rematch matching over all non-bye players and adopt it when it has
  // strictly fewer rematches. Keeps the bye assignment from above intact.
  const map = new Map(active.map(p => [p.id, p]))
  const nonBye = pairings.filter(p => !p.isBye)
  const byes = pairings.filter(p => p.isBye)
  const greedyRematches = countRematches(nonBye, map)
  if (greedyRematches > 0) {
    const global = pairGlobalMinRematch(remaining)
    if (global && countRematches(global, map) < greedyRematches) {
      return [...byes, ...global]
    }
  }

  return pairings
}
