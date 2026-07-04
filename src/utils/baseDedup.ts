/**
 * Common base deduplication for chaos draft/sealed.
 *
 * When multiple sets are combined, many common bases are functionally
 * identical (same aspect, same HP, no game text). This deduplicates
 * them so the DeckBuilder shows one per aspect+HP combination, including
 * preview/next-set bases as they enter the catalog.
 */

interface BaseCard {
  aspects?: string[]
  hp?: number
  isBase?: boolean
  type?: string
  rarity?: string
  [key: string]: unknown
}

/**
 * Deduplicate common bases by aspect+HP.
 *
 * Bases with the same primary aspect and same HP are functionally
 * identical across sets (e.g. a 30HP Vigilance base from SOR and
 * a 30HP Vigilance base from ASH). Keep only one per combination.
 *
 * Sorts results by aspect order (Vigilance, Command, Aggression, Cunning)
 * then by HP descending, then by name.
 */
export function deduplicateCommonBases<T extends BaseCard>(cards: T[]): T[] {
  const commonBases = cards.filter(
    card => (card.isBase || card.type === 'Base') && card.rarity === 'Common'
  )

  const seen = new Map<string, T>()
  for (const card of commonBases) {
    const aspect = (card.aspects || [])[0] || 'none'
    const hp = card.hp || 0
    const key = `${aspect}_${hp}`
    if (!seen.has(key)) {
      seen.set(key, card)
    }
  }

  const aspectOrder: string[] = ['Vigilance', 'Command', 'Aggression', 'Cunning']
  const getAspectSortValue = (card: T) => {
    const aspects = card.aspects || []
    if (aspects.length === 0) return 999
    for (let i = 0; i < aspectOrder.length; i++) {
      if (aspects.includes(aspectOrder[i] as string)) return i
    }
    return 999
  }

  return Array.from(seen.values()).sort((a, b) => {
    const aVal = getAspectSortValue(a)
    const bVal = getAspectSortValue(b)
    if (aVal !== bVal) return aVal - bVal
    // Higher HP first within same aspect
    const aHp = a.hp || 0
    const bHp = b.hp || 0
    if (aHp !== bHp) return bHp - aHp
    return ((a as any).name || '').localeCompare((b as any).name || '')
  })
}
