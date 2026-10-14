// Attach the Hyperspace printing's art to stats rows (server side), so lists
// can show hyperspace art without shipping the card database to the browser.
import { getCardsBySet } from './cardData'

interface ArtCard { name?: string; subtitle?: string | null; variantType?: string; imageUrl?: string | null; backImageUrl?: string | null }
interface Art { imageUrl: string | null; backImageUrl: string | null }
export type HyperspaceArtIndex = Map<string, Art>

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Hyperspace (non-foil) printings keyed by "name|subtitle" and, as a fallback, bare name. */
export function buildHyperspaceArtIndex(cards: ArtCard[]): HyperspaceArtIndex {
  const index: HyperspaceArtIndex = new Map()
  for (const card of cards) {
    if (card.variantType !== 'Hyperspace' || !card.name) continue
    const art = { imageUrl: card.imageUrl || null, backImageUrl: card.backImageUrl || null }
    const full = `${norm(card.name)}|${norm(card.subtitle)}`
    if (!index.has(full)) index.set(full, art)
    if (!index.has(norm(card.name))) index.set(norm(card.name), art)
  }
  return index
}

const bySet = new Map<string, HyperspaceArtIndex>()
export function hyperspaceArtIndexForSet(setCode: string): HyperspaceArtIndex {
  const base = setCode.replace(/-CB$/, '')
  if (!bySet.has(base)) bySet.set(base, buildHyperspaceArtIndex(getCardsBySet(base) as ArtCard[]))
  return bySet.get(base)!
}

export function attachHyperspaceArt<T extends Record<string, any>>(
  rows: T[],
  index: HyperspaceArtIndex,
  nameKey: string = 'cardName',
): (T & { hyperspaceImageUrl: string | null; hyperspaceBackImageUrl: string | null })[] {
  return rows.map((row) => {
    const name = norm(row[nameKey])
    const art = (row.subtitle ? index.get(`${name}|${norm(row.subtitle)}`) : null) || index.get(name)
    return { ...row, hyperspaceImageUrl: art?.imageUrl ?? null, hyperspaceBackImageUrl: art?.backImageUrl ?? null }
  })
}
