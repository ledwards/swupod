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

function pairGroup(group: PairingPlayer[], previouslyPaired: Set<string>): { pairings: Pairing[], leftover: PairingPlayer | null } {
  const pairings: Pairing[] = []
  const available = [...group]

  while (available.length >= 2) {
    const player = available.shift()!
    // Find first available opponent who hasn't been paired with player
    const opponentIdx = available.findIndex(p => !player.opponents.includes(p.id) && !p.opponents.includes(player.id))

    if (opponentIdx !== -1) {
      const opponent = available.splice(opponentIdx, 1)[0]!
      pairings.push({ player1Id: player.id, player2Id: opponent.id, isBye: false })
      previouslyPaired.add(`${player.id}:${opponent.id}`)
    } else {
      // No valid opponent found (rematch unavoidable) — pair with first available
      const opponent = available.shift()!
      pairings.push({ player1Id: player.id, player2Id: opponent.id, isBye: false })
      previouslyPaired.add(`${player.id}:${opponent.id}`)
    }
  }

  const leftover = available.length === 1 ? (available[0] ?? null) : null
  return { pairings, leftover }
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

  return pairings
}
