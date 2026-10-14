/**
 * Popularity (share of built decks) against win rate, one point per leader,
 * for the Meta overview's quadrant chart. Pure.
 */

export interface ScatterWinRate {
  leaderName: string
  winRate: number
  matches: number
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
}

export interface ScatterPopularity {
  cardName: string
  selectionRate: number
}

export interface ScatterPoint {
  leaderName: string
  imageUrl: string | null
  share: number
  winRate: number
  matches: number
}

export interface LeaderScatter {
  points: ScatterPoint[]
  /** Match-weighted field win rate: the horizontal quadrant line. */
  avgWinRate: number | null
  /** Mean share across plotted leaders: the vertical quadrant line. */
  avgShare: number | null
  winRateRange: [number, number]
  shareMax: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function buildLeaderScatter(
  winRates: ScatterWinRate[],
  popularity: ScatterPopularity[],
  { minMatches = 20 }: { minMatches?: number } = {},
): LeaderScatter {
  const shareByName = new Map(popularity.map((p) => [p.cardName, Number(p.selectionRate) || 0]))
  const points: ScatterPoint[] = winRates
    .filter((w) => w.matches >= minMatches && shareByName.has(w.leaderName))
    .map((w) => ({
      leaderName: w.leaderName,
      // Portrait back art crops cleanly to a square; fall back to the front.
      imageUrl: w.leaderBackImageUrl || w.leaderImageUrl || null,
      share: shareByName.get(w.leaderName)!,
      winRate: w.winRate,
      matches: w.matches,
    }))

  if (points.length === 0) {
    return { points, avgWinRate: null, avgShare: null, winRateRange: [40, 60], shareMax: 10 }
  }

  const totalMatches = points.reduce((s, p) => s + p.matches, 0)
  const avgWinRate = round1(points.reduce((s, p) => s + p.winRate * p.matches, 0) / totalMatches)
  const avgShare = round1(points.reduce((s, p) => s + p.share, 0) / points.length)
  const lo = Math.min(...points.map((p) => p.winRate))
  const hi = Math.max(...points.map((p) => p.winRate))
  const spread = Math.max(hi - avgWinRate, avgWinRate - lo, 5) + 2
  return {
    points,
    avgWinRate,
    avgShare,
    winRateRange: [Math.floor(avgWinRate - spread), Math.ceil(avgWinRate + spread)],
    shareMax: Math.ceil(Math.max(...points.map((p) => p.share)) * 1.15 + 0.5),
  }
}
