export interface PoolRarityCard {
  rarity?: string | null
  /** Stable per-card key for duplicate detection (cardId or name). */
  cardId?: string | null
  id?: string | null
  name?: string | null
}

export interface PoolRarityStats {
  /** Total cards considered (deck + sideboard, excluding leaders/bases). */
  total: number
  legendaries: number
  rares: number
  /** Extra copies beyond the first of each distinct card (i.e. total - distinct). */
  duplicates: number
}

/**
 * Rarity/duplicate breakdown of a draft pool — the "how did my pool roll" numbers
 * the Pool Context panel shows. Counts Legendary and Rare cards and the number of
 * duplicate copies (cards you opened more than one of). Duplicate identity keys on
 * cardId (the printing) then name, since `id` is unique per instance.
 */
export function computePoolRarityStats(cards: PoolRarityCard[]): PoolRarityStats {
  let legendaries = 0
  let rares = 0
  const counts = new Map<string, number>()
  for (const c of cards) {
    const rarity = String(c.rarity ?? '').toLowerCase()
    if (rarity === 'legendary') legendaries += 1
    else if (rarity === 'rare') rares += 1
    const key = c.cardId || c.name || c.id || ''
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let duplicates = 0
  for (const n of counts.values()) if (n > 1) duplicates += n - 1
  return { total: cards.length, legendaries, rares, duplicates }
}
