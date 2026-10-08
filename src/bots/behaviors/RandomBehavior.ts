// @ts-nocheck
/**
 * Random Behavior
 *
 * The simplest behavior - picks randomly from available options.
 * Leaders: random selection
 * Cards: prefers higher rarity (Legendary > Rare > Uncommon > Common)
 */

import type { RawCard } from '../../utils/cardData'

interface DraftContext {
  draftedLeaders?: RawCard[]
  draftedCards?: RawCard[]
  setCode?: string
}

export class RandomBehavior {
  name: string

  constructor() {
    this.name = 'random'
  }

  /**
   * Select a leader from available options
   * @param leaders - Available leaders to pick from
   * @param _context - Draft context (draftedLeaders, setCode, etc.)
   * @returns Selected leader
   */
  selectLeader(leaders: RawCard[], _context: DraftContext = {}): RawCard | null {
    if (!leaders || leaders.length === 0) return null
    const pickIndex = Math.floor(Math.random() * leaders.length)
    return leaders[pickIndex] ?? null
  }

  /**
   * Select a card from the current pack
   * @param pack - Current pack of cards
   * @param _context - Draft context (draftedCards, draftedLeaders, setCode, etc.)
   * @returns Selected card
   */
  selectCard(pack: RawCard[], _context: DraftContext = {}): RawCard | null {
    if (!pack || pack.length === 0) return null

    // Sort by rarity and pick the best
    const rarityOrder: Record<string, number> = { 'Legendary': 0, 'Rare': 1, 'Uncommon': 2, 'Common': 3 }
    const sorted = [...pack].sort(
      (a, b) => (rarityOrder[a.rarity || ''] ?? 4) - (rarityOrder[b.rarity || ''] ?? 4)
    )

    return sorted[0] ?? null
  }
}
