// Grouping for a player's drafted cards — used by the competitive between-pack
// "Review Your Cards" peek and mirrors the non-competitive drafted-cards viewer
// (DraftReviewModal). Pure functions so both surfaces group identically.

export interface GroupableCard {
  cost?: number | null
  aspects?: string[] | null
  [k: string]: unknown
}

export type DraftGroupMode = 'pack' | 'cost' | 'aspect'

export interface CardGroup<T> {
  key: string
  label: string
  cards: T[]
}

/** Aspect sort key (Vigilance→Command→Aggression→Cunning, then other singles,
 *  then multi-aspect, then Neutral last). Mirrors DeckBuilder/DraftReviewModal. */
export function getAspectKey(card: GroupableCard): string {
  const aspects = card.aspects || []
  if (aspects.length === 0) return 'ZZZ_Neutral'
  if (aspects.length === 1) {
    const a = aspects[0] ?? ''
    const priority: Record<string, string> = {
      Vigilance: 'A_Vigilance',
      Command: 'B_Command',
      Aggression: 'C_Aggression',
      Cunning: 'D_Cunning',
    }
    return priority[a] || `E_${a}`
  }
  return `F_${[...aspects].sort().join('/')}`
}

export function getAspectLabel(key: string): string {
  if (key === 'ZZZ_Neutral') return 'Neutral'
  if (key.startsWith('A_')) return 'Vigilance'
  if (key.startsWith('B_')) return 'Command'
  if (key.startsWith('C_')) return 'Aggression'
  if (key.startsWith('D_')) return 'Cunning'
  if (key.startsWith('E_') || key.startsWith('F_')) return key.substring(2)
  return key
}

/**
 * Group drafted cards (given in pick order) by the chosen mode, returning
 * ordered groups ready to render.
 * - 'pack'   → "Pack 1/2/3…" by pick order (packSize per pack, default 14)
 * - 'cost'   → "Cost 0…7", then "Cost 8+"
 * - 'aspect' → Vigilance, Command, Aggression, Cunning, …, multi, Neutral
 */
export function groupDraftedCards<T extends GroupableCard>(
  cards: T[],
  mode: DraftGroupMode,
  packSize = 14,
  padCostColumns = false,
): CardGroup<T>[] {
  const size = packSize > 0 ? packSize : 14

  if (mode === 'pack') {
    const byPack = new Map<number, T[]>()
    cards.forEach((card, i) => {
      const pack = Math.floor(i / size) + 1
      if (!byPack.has(pack)) byPack.set(pack, [])
      byPack.get(pack)!.push(card)
    })
    return [...byPack.keys()].sort((a, b) => a - b)
      .map(pack => ({ key: `pack-${pack}`, label: `Pack ${pack}`, cards: byPack.get(pack)! }))
  }

  if (mode === 'cost') {
    const byCost = new Map<string, T[]>()
    cards.forEach(card => {
      const cost = typeof card.cost === 'number' ? card.cost : 0
      const seg = cost >= 8 ? '8+' : String(cost)
      if (!byCost.has(seg)) byCost.set(seg, [])
      byCost.get(seg)!.push(card)
    })
    const order = ['0', '1', '2', '3', '4', '5', '6', '7', '8+']
    // padCostColumns: keep every cost column for a steady, readable curve even
    // when empty — EXCEPT Cost 0, which only appears when a zero-cost card exists.
    const segs = padCostColumns
      ? order.filter(s => s !== '0' || byCost.has('0'))
      : order.filter(s => byCost.has(s))
    return segs.map(seg => ({ key: `cost-${seg}`, label: `Cost ${seg}`, cards: byCost.get(seg) ?? [] }))
  }

  // aspect
  const byAspect = new Map<string, T[]>()
  cards.forEach(card => {
    const key = getAspectKey(card)
    if (!byAspect.has(key)) byAspect.set(key, [])
    byAspect.get(key)!.push(card)
  })
  return [...byAspect.keys()].sort()
    .map(key => ({ key, label: getAspectLabel(key), cards: byAspect.get(key)! }))
}
