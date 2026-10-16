/**
 * Pure helpers for the Showcase Collection table: counting, export order and
 * where each card sits on the table.
 */

export interface ShowcaseLeader {
  id: string
  cardId: string
  cardName: string
  cardSubtitle?: string
  setCode: string
}

export interface ShowcaseCardData {
  id: string
  name: string
  subtitle?: string
  imageUrl?: string
  backImageUrl?: string
  aspects?: string[]
  isLeader?: boolean
  variantType?: string
}

export interface CardPosition { x: number; y: number; rotation: number; zIndex: number }
export interface Size { width: number; height: number }

/** Distinct leaders owned: a second copy of the same name + subtitle doesn't count again. */
export function countUniqueShowcases(owned: ShowcaseLeader[], cards: Record<string, ShowcaseCardData>): number {
  return new Set(owned.map(s => `${s.cardName}|${cards[s.cardId]?.subtitle || ''}`)).size
}

/** Export order: set number, villains before heroes, then alphabetical. */
export function sortForExport(owned: ShowcaseLeader[], cards: Record<string, ShowcaseCardData>, setCodes: string[]): ShowcaseLeader[] {
  const setOrder = Object.fromEntries(setCodes.map((code, i) => [code, i + 1])) as Record<string, number>
  const villainFirst = (s: ShowcaseLeader) => (cards[s.cardId]?.aspects?.includes('Villainy') ? 0 : 1)
  return [...owned].sort((a, b) =>
    (setOrder[a.setCode] || 99) - (setOrder[b.setCode] || 99) ||
    villainFirst(a) - villainFirst(b) ||
    (a.cardName || '').localeCompare(b.cardName || ''))
}

export function clampToTable(p: { x: number; y: number }, table: Size, card: Size): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(table.width - card.width, p.x)),
    y: Math.max(0, Math.min(table.height - card.height, p.y)),
  }
}

/**
 * Spread the cards over the table: one grid cell each, nudged off-centre and
 * tilted up to 10 degrees, so the collection reads as cards dropped on a table.
 */
export function scatterPositions(ids: string[], table: Size, card: Size, random: () => number = Math.random): Record<string, CardPosition> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const rows = Math.max(1, Math.ceil(ids.length / cols))
  const cellW = table.width / cols
  const cellH = table.height / rows
  const out: Record<string, CardPosition> = {}
  ids.forEach((id, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const base = { x: col * cellW + (cellW - card.width) / 2, y: row * cellH + (cellH - card.height) / 2 }
    const jitter = { x: (random() - 0.5) * cellW * 0.5, y: (random() - 0.5) * cellH * 0.3 }
    const { x, y } = clampToTable({ x: base.x + jitter.x, y: base.y + jitter.y }, table, card)
    out[id] = { x, y, rotation: (random() - 0.5) * 20, zIndex: i + 1 }
  })
  return out
}
