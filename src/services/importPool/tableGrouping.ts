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

const MAIN_ASPECTS = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const SECONDARY_ASPECTS = new Set(['Heroism', 'Villainy'])

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
