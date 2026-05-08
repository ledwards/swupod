// @ts-nocheck
/**
 * Map a card from cardCache to the printed table on a sealed-deck
 * registration sheet. The sheet has 10 tables, fixed layout:
 *
 *   - Leaders, Bases (own type)
 *   - Vigilance, Command, Aggression, Cunning (single main-aspect tables;
 *     each table may contain sub-sections for cards that ALSO carry a
 *     Heroism or Villainy secondary, but for extraction we don't need to
 *     identify the sub-section — every card in a Vigilance+Heroism row
 *     belongs in the Vigilance table)
 *   - Heroism, Villainy (cards with ONLY a secondary aspect)
 *   - Multicolor (cards with 2+ main aspects, regardless of secondary)
 *   - NoAspect (cards with no aspects)
 *
 * This mapping is used by the per-table extraction pass: each table gets
 * its own crop + a closed vocabulary of just the cards in that table, so
 * Claude can return marks by card number rather than generating names.
 */

export type TableName =
  | 'Leaders'
  | 'Bases'
  | 'Vigilance'
  | 'Command'
  | 'Aggression'
  | 'Cunning'
  | 'Heroism'
  | 'Villainy'
  | 'Multicolor'
  | 'NoAspect'

export const TABLE_NAMES: TableName[] = [
  'Leaders',
  'Bases',
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Heroism',
  'Villainy',
  'Multicolor',
  'NoAspect',
]

/**
 * Every sub-group key Phase 1 can return as a sub-section bbox. Phase 1's
 * schema enum uses this list. Mirrors the keys getCardSubGroup() emits.
 */
export const SUB_GROUP_KEYS: string[] = [
  // Singleton sub-groups (the entire table is one sub-group)
  'Leaders',
  'Bases',
  'Heroism',
  'Villainy',
  'NoAspect',

  // Single-main-aspect tables, split by secondary
  'Vigilance',
  'Vigilance+Heroism',
  'Vigilance+Villainy',
  'Command',
  'Command+Heroism',
  'Command+Villainy',
  'Aggression',
  'Aggression+Heroism',
  'Aggression+Villainy',
  'Cunning',
  'Cunning+Heroism',
  'Cunning+Villainy',

  // Multicolor — split by primary main-aspect pair
  'Multicolor:Command+Vigilance',
  'Multicolor:Aggression+Vigilance',
  'Multicolor:Cunning+Vigilance',
  'Multicolor:Aggression+Command',
  'Multicolor:Command+Cunning',
  'Multicolor:Aggression+Cunning',
]

export const MAIN_ASPECTS = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
export const SECONDARY_ASPECTS = new Set(['Heroism', 'Villainy'])

export function getCardTable(card: any): TableName | null {
  if (!card) return null
  if (card.isLeader) return 'Leaders'
  if (card.isBase) return 'Bases'
  const aspects: string[] = card.aspects || []
  const mains = aspects.filter((a) => MAIN_ASPECTS.has(a))
  const secs = aspects.filter((a) => SECONDARY_ASPECTS.has(a))
  if (mains.length >= 2) return 'Multicolor'
  if (mains.length === 1) return mains[0] as TableName
  if (secs.length >= 1) return secs[0] as TableName
  return 'NoAspect'
}

export function cardNumberOf(cardId: string): number {
  const m = (cardId || '').match(/[-_](\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

export function groupCardsByTable(cards: any[]): Map<TableName, any[]> {
  const result = new Map<TableName, any[]>()
  for (const tn of TABLE_NAMES) result.set(tn, [])
  for (const card of cards) {
    const table = getCardTable(card)
    if (table) result.get(table)!.push(card)
  }
  for (const list of result.values()) {
    list.sort((a, b) => cardNumberOf(a.cardId) - cardNumberOf(b.cardId))
  }
  return result
}

/**
 * Sub-group key WITHIN a table. Used for sub-aspect splitting so each
 * extraction call has a smaller, more focused vocabulary.
 *
 * Single-aspect tables (Vigilance, Command, Aggression, Cunning):
 *   - "<Aspect>+Heroism" — the Heroism sub-section of the table
 *   - "<Aspect>+Villainy" — the Villainy sub-section
 *   - "<Aspect>" — the alone sub-section
 *
 * Multicolor: split by PRIMARY PAIR (V+C, V+A, V+Cu, C+A, C+Cu, A+Cu).
 * Three-aspect cards (e.g. V+C+H) are grouped under their two main
 * aspects' pair — so V+C+H goes under V+C.
 *
 * Leaders / Bases / Heroism / Villainy / NoAspect: not split — return
 * the table name itself.
 */
export function getCardSubGroup(card: any): string {
  const table = getCardTable(card)
  if (!table) return 'Unknown'
  if (table === 'Leaders' || table === 'Bases' || table === 'NoAspect') return table
  if (table === 'Heroism' || table === 'Villainy') return table

  const aspects: string[] = card.aspects || []
  const mains = aspects.filter((a) => MAIN_ASPECTS.has(a)).sort()
  const secs = aspects.filter((a) => SECONDARY_ASPECTS.has(a))

  if (table === 'Multicolor') {
    // Primary pair from the two mains
    return `Multicolor:${mains.join('+')}`
  }
  // Single-aspect table — split by secondary
  if (secs.includes('Heroism')) return `${table}+Heroism`
  if (secs.includes('Villainy')) return `${table}+Villainy`
  return table
}

/**
 * Group cards by sub-group key. Return entries are ordered so that, for
 * a given table, sub-groups appear in a stable order driven by the lowest
 * card number in each.
 */
export function groupCardsBySubGroup(cards: any[]): Array<{ subGroup: string; table: TableName; cards: any[] }> {
  const buckets = new Map<string, any[]>()
  for (const c of cards) {
    const sg = getCardSubGroup(c)
    if (!buckets.has(sg)) buckets.set(sg, [])
    buckets.get(sg)!.push(c)
  }
  const rows = [...buckets.entries()].map(([sg, list]) => {
    list.sort((a, b) => cardNumberOf(a.cardId) - cardNumberOf(b.cardId))
    return {
      subGroup: sg,
      table: getCardTable(list[0]) as TableName,
      cards: list,
      minNumber: cardNumberOf(list[0].cardId),
    }
  })
  // Order by table (canonical TABLE_NAMES order), then by minNumber within table
  rows.sort((a, b) => {
    const ta = TABLE_NAMES.indexOf(a.table)
    const tb = TABLE_NAMES.indexOf(b.table)
    if (ta !== tb) return ta - tb
    return a.minNumber - b.minNumber
  })
  return rows.map(({ subGroup, table, cards }) => ({ subGroup, table, cards }))
}
