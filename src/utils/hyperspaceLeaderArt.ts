// @ts-nocheck
// Resolve a leader's HYPERSPACE front art by name + set.
//
// The Hyperspace printing of a leader has its OWN collector number (e.g. Tobias
// Beckett is LAW-002 normal but LAW-266 hyperspace), so it does NOT share cardId
// with the normal leader — it shares the name within the set. We key by
// set::name and return the Hyperspace variant's full-art front image.

import { getAllCards } from './cardData'

let hyperspaceByName: Map<string, string> | null = null

function hsKey(setCode: unknown, name: unknown): string {
  return `${String(setCode || '').toUpperCase()}::${String(name || '').trim().toLowerCase()}`
}

function ensureIndex(): Map<string, string> {
  if (hyperspaceByName) return hyperspaceByName
  const map = new Map<string, string>()
  for (const c of getAllCards()) {
    const isLeader = c.isLeader || c.type === 'Leader'
    const isHs = c.isHyperspace || (typeof c.variantType === 'string' && c.variantType.includes('Hyperspace'))
    if (!isLeader || !isHs || !c.name) continue
    // Unit-side (back) Hyperspace art — the landscape deployed-unit version.
    const art = c.backImageUrl || c.imageUrl
    const key = hsKey(c.set, c.name)
    if (art && !map.has(key)) map.set(key, art)
  }
  hyperspaceByName = map
  return map
}

/** Hyperspace front art for a leader identified by name + set, or null. */
export function hyperspaceLeaderArt(name: string | null | undefined, setCode: string | null | undefined): string | null {
  if (!name) return null
  return ensureIndex().get(hsKey(setCode, name)) || null
}

/** Same, given a saved card object ({ name, set } or { name, setCode }). */
export function hyperspaceLeaderArtForCard(card: any): string | null {
  if (!card) return null
  return hyperspaceLeaderArt(card.name, card.set || card.setCode)
}
