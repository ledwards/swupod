import { ASPECT_ORDER, averageCost, costCurve, type StatsCard } from './composition'
import { splitDeckAndSideboard } from './split'

export interface DeckListSummary {
  /** Deck cards at each cost 0..7 (7 = 7+). */
  curve: number[]
  /** Deck cards per aspect, most first; aspectless cards are left out. */
  aspects: Array<{ aspect: string; count: number }>
  avgCost: number
}

/** The small curve and aspect counts a deck list row shows. Null when nothing is in the deck yet. */
export function deckListSummary(cardPositions: Parameters<typeof splitDeckAndSideboard>[0]): DeckListSummary | null {
  const { deck } = splitDeckAndSideboard(cardPositions)
  if (deck.length === 0) return null
  const counts = new Map<string, number>()
  for (const card of deck as StatsCard[]) for (const aspect of new Set(card.aspects || [])) counts.set(aspect, (counts.get(aspect) || 0) + 1)
  return {
    curve: costCurve(deck, deck).map(bucket => bucket.primaryTotal),
    aspects: ASPECT_ORDER.filter(aspect => counts.has(aspect))
      .map(aspect => ({ aspect, count: counts.get(aspect)! }))
      .sort((a, b) => b.count - a.count),
    avgCost: Math.round(averageCost(deck) * 100) / 100,
  }
}
