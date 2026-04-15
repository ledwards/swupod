/**
 * Pure helper functions for ResultReportModal.
 *
 * Extracted into a separate module so they can be unit-tested
 * without pulling in React or CSS dependencies.
 */

export function countWins(games: (string | null)[], player: string): number {
  return games.filter(g => g === player).length
}

export function isDecided(game1: string | null, game2: string | null, game3: string | null): boolean {
  // Need at least 2 games filled to consider the match decided.
  if (!game1 || !game2) return false
  const games = [game1, game2, game3]
  const p1Wins = countWins(games, 'player1')
  const p2Wins = countWins(games, 'player2')
  // Someone won the match (>= 2 game wins).
  if (p1Wins >= 2 || p2Wins >= 2) return true
  // No one has 2 wins. Match is a draw IFF all 3 games are recorded.
  // (Mirrors deriveMatchWinner in src/services/matchmaking/results.ts:51 —
  // 3 games filled with no 2-win = match-level draw.)
  return game3 !== null
}

export function needsGame3(game1: string | null, game2: string | null): boolean {
  if (!game1 || !game2) return false
  const p1Wins = countWins([game1, game2], 'player1')
  const p2Wins = countWins([game1, game2], 'player2')
  // If someone already has 2 wins after 2 games, no game 3 needed.
  if (p1Wins >= 2 || p2Wins >= 2) return false
  // Otherwise game 3 is needed (split, draws, or 0-0).
  return true
}
