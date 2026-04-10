export interface GameResults {
  game1: string | null
  game2: string | null
  game3: string | null
}

export interface MatchForCalc {
  player1Id: string
  player2Id: string | null
  matchWinner: string | null
  isBye: boolean
  finalConfirmed: boolean
}

export interface PlayerForRank {
  id: string
  matchWins: number
  matchLosses: number
}

export interface RankedPlayer {
  id: string
  rank: number
  matchWins: number
  matchLosses: number
  omwPercent: number
}

export function deriveMatchWinner(
  game1: string | null,
  game2: string | null,
  game3: string | null
): string | null {
  const games = [game1, game2, game3]
  const nonNull = games.filter((g) => g !== null)

  if (nonNull.length < 2) return null

  let p1Wins = 0
  let p2Wins = 0

  for (const game of games) {
    if (game === 'player1') p1Wins++
    else if (game === 'player2') p2Wins++

    if (p1Wins === 2) return 'player1'
    if (p2Wins === 2) return 'player2'
  }

  // 3 games played, no one has 2 wins
  if (nonNull.length === 3) return 'draw'

  return null
}

export function resultsMatch(sub1: GameResults, sub2: GameResults): boolean {
  return (
    sub1.game1 === sub2.game1 &&
    sub1.game2 === sub2.game2 &&
    sub1.game3 === sub2.game3
  )
}

export function calculateOMW(
  playerId: string,
  matches: MatchForCalc[],
  _allPlayerIds: string[]
): number {
  const MIN_RATE = 0.33

  // Find confirmed non-bye matches where this player participated
  const playerMatches = matches.filter(
    (m) =>
      !m.isBye &&
      m.finalConfirmed &&
      (m.player1Id === playerId || m.player2Id === playerId)
  )

  if (playerMatches.length === 0) return MIN_RATE

  // Collect unique opponent IDs
  const opponentIds = new Set<string>()
  for (const m of playerMatches) {
    const opponentId = m.player1Id === playerId ? m.player2Id : m.player1Id
    if (opponentId !== null) opponentIds.add(opponentId)
  }

  if (opponentIds.size === 0) return MIN_RATE

  const rates: number[] = []

  for (const opponentId of opponentIds) {
    // Get all confirmed non-bye matches for this opponent
    const opponentMatches = matches.filter(
      (m) =>
        !m.isBye &&
        m.finalConfirmed &&
        (m.player1Id === opponentId || m.player2Id === opponentId)
    )

    const wins = opponentMatches.filter(
      (m) => m.matchWinner === opponentId
    ).length
    const total = opponentMatches.length

    const rate = total === 0 ? 0 : wins / total
    rates.push(Math.max(MIN_RATE, rate))
  }

  return rates.reduce((sum, r) => sum + r, 0) / rates.length
}

export function rankPlayers(
  players: PlayerForRank[],
  matches: MatchForCalc[],
  allPlayerIds?: string[]
): RankedPlayer[] {
  const ids = allPlayerIds ?? players.map((p) => p.id)

  const ranked = players.map((p) => ({
    id: p.id,
    matchWins: p.matchWins,
    matchLosses: p.matchLosses,
    omwPercent: calculateOMW(p.id, matches, ids),
    rank: 0,
  }))

  ranked.sort((a, b) => {
    if (b.matchWins !== a.matchWins) return b.matchWins - a.matchWins
    return b.omwPercent - a.omwPercent
  })

  ranked.forEach((p, i) => {
    p.rank = i + 1
  })

  return ranked
}
