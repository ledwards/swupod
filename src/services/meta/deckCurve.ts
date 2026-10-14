/**
 * Cost curve of every built deck vs the decks that won more than they lost.
 * Values are average copies per deck in each cost bucket. Pure.
 */

export const CURVE_BUCKETS = ['0-1', '2', '3', '4', '5', '6', '7', '8+'] as const

export interface CurveDeck {
  /** One entry per copy in the main deck (leader and base excluded). */
  costs: number[]
  wins: number
  losses: number
}

export interface CurveBucket {
  label: (typeof CURVE_BUCKETS)[number]
  all: number
  winning: number
}

export interface CurveComparison {
  buckets: CurveBucket[]
  allDecks: number
  winningDecks: number
  allAvgCost: number | null
  winningAvgCost: number | null
}

function bucketIndex(cost: number): number {
  if (cost <= 1) return 0
  if (cost >= 8) return 7
  return cost - 1
}

const round1 = (n: number) => Math.round(n * 10) / 10

function summarize(decks: CurveDeck[]) {
  const totals = new Array(CURVE_BUCKETS.length).fill(0)
  let costSum = 0
  let copies = 0
  for (const deck of decks) {
    for (const cost of deck.costs) {
      totals[bucketIndex(cost)] += 1
      costSum += cost
      copies += 1
    }
  }
  return {
    perDeck: totals.map((t) => (decks.length ? round1(t / decks.length) : 0)),
    avgCost: copies ? round1(costSum / copies) : null,
  }
}

export function buildCurveComparison(decks: CurveDeck[]): CurveComparison {
  const winners = decks.filter((d) => d.wins > d.losses)
  const all = summarize(decks)
  const win = summarize(winners)
  return {
    buckets: CURVE_BUCKETS.map((label, i) => ({ label, all: all.perDeck[i] ?? 0, winning: win.perDeck[i] ?? 0 })),
    allDecks: decks.length,
    winningDecks: winners.length,
    allAvgCost: all.avgCost,
    winningAvgCost: win.avgCost,
  }
}
