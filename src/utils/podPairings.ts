// @ts-nocheck
/**
 * Pod Pairing Algorithm
 *
 * Computes round 1 pairings for a draft pod.
 * Uses opposite-seat pairing: player[i] is paired with player[i + half].
 * For odd player counts, one player gets a random bye.
 */

export interface PairingPlayer {
  userId: string
  seatNumber: number
}

export interface PairingMatch {
  player1Id: string
  player2Id: string
}

export interface PairingResult {
  matches: PairingMatch[]
  byePlayerId: string | null
}

/**
 * Compute pairings from players sorted by seat number.
 * Opposite-seat pairing: player[i] paired with player[i + half].
 * Returns matches array and optionally a bye player ID.
 *
 * @param players - Array of players with userId and seatNumber
 * @param storedByePlayerId - Previously stored bye player ID (for consistency)
 * @returns Pairing result with matches and bye player
 */
/**
 * Compute random pairings via Fisher-Yates shuffle.
 * Used for sealed pods where seat position doesn't matter.
 * Handles odd-count with a random bye.
 *
 * @param players - Array of players with userId and seatNumber
 * @returns Pairing result with matches and bye player
 */
export function computeRandomPairings(
  players: PairingPlayer[]
): PairingResult {
  if (players.length < 2) {
    return {
      matches: [],
      byePlayerId: players.length === 1 ? players[0].userId : null,
    }
  }

  // Fisher-Yates shuffle
  const shuffled = [...players]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  let byePlayerId: string | null = null

  // Handle odd player count - last player gets a bye
  if (shuffled.length % 2 === 1) {
    byePlayerId = shuffled[shuffled.length - 1].userId
    shuffled.pop()
  }

  // Pair sequentially: [0,1], [2,3], [4,5], ...
  const matches: PairingMatch[] = []
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({
      player1Id: shuffled[i].userId,
      player2Id: shuffled[i + 1].userId,
    })
  }

  return { matches, byePlayerId }
}

/**
 * Round-1 pairings persisted on a sealed pod's settings when packs are dealt.
 *
 * SPEC:
 * - CASUAL sealed pods store a one-off random pairing. `/sealed/:id/pod` renders
 *   it under "Your Opponent" — that hub is the whole match experience.
 * - COMPETITIVE Sealed pods store NOTHING. Their round 1 is paired by the Swiss
 *   bracket (`pairRound1`) when the host starts matches, so a stored random
 *   pairing would authoritatively name an opponent the bracket never gave the
 *   player.
 *
 * @param players - Players in the pod
 * @param competitive - Whether the pod is a Competitive (Swiss Practice) pod
 * @returns Pairings to persist, or null when the pod must not store any
 */
export function computeSealedPodPairings(
  players: PairingPlayer[],
  competitive: boolean
): PairingResult | null {
  if (competitive) return null
  return computeRandomPairings(players)
}

export function computePairings(
  players: PairingPlayer[],
  storedByePlayerId: string | null = null
): PairingResult {
  if (players.length < 2) {
    return {
      matches: [],
      byePlayerId: players.length === 1 ? players[0].userId : null,
    }
  }

  let byePlayerId: string | null = null

  // Determine bye for odd player count
  if (players.length % 2 === 1) {
    if (storedByePlayerId && players.some(p => p.userId === storedByePlayerId)) {
      byePlayerId = storedByePlayerId
    } else {
      // Random bye
      const randomIndex = Math.floor(Math.random() * players.length)
      byePlayerId = players[randomIndex].userId
    }
  }

  // Remove bye player from pairing list
  const pairingPlayers = byePlayerId
    ? players.filter(p => p.userId !== byePlayerId)
    : [...players]

  // Sort by seat number
  pairingPlayers.sort((a, b) => a.seatNumber - b.seatNumber)

  // Pair opposite seats: player[i] with player[i + half]
  const half = pairingPlayers.length / 2
  const matches: PairingMatch[] = []

  for (let i = 0; i < half; i++) {
    matches.push({
      player1Id: pairingPlayers[i].userId,
      player2Id: pairingPlayers[i + half].userId,
    })
  }

  return { matches, byePlayerId }
}
