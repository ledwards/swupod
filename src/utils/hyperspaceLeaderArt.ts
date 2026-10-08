// @ts-nocheck
// Resolve a leader's landscape (unit-side) art by name + set.
//
// PREFERS the Hyperspace printing but FALLS BACK to the normal printing when no
// Hyperspace variant exists — e.g. pre-release sets like ASH that have no
// Hyperspace leaders in card data yet, or any individual leader without a HS
// printing. (Historically this only returned Hyperspace art, which left the art
// blank for those cases; the name is kept for its callers.)
//
// Leaders are identified by their FULL name. card data stores name + subtitle
// separately ("Darth Vader" + "Unstoppable"); the canonical full name is
// "Darth Vader, Unstoppable". The SAME bare name maps to DIFFERENT leader cards
// across sets — Darth Vader is "Unstoppable" (LAW), "Dark Lord of the Sith"
// (SOR), "Victor Squadron Leader" (...) — each with its own art. So we key by
// full name to resolve the RIGHT art, and never strip the subtitle to guess.
//
// Two indexes:
//   bySet  — `SET::name` for both the full name and the bare name. Bare name is
//            unique within a set, so deck/pool callers that pass just `card.name`
//            still resolve, scoped to their own set.
//   byFull — `fullname` with NO set, because an OPPONENT can play a leader from
//            any set (constructed play), while the match is tagged with the
//            reporter's pool set. The full name is globally unique enough to pick
//            the right printing without a set hint.

import { getAllCards } from './cardData'

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase()
}

function fullLeaderName(card: any): string {
  const name = String(card?.name ?? '').trim()
  const subtitle = String(card?.subtitle ?? '').trim()
  return subtitle ? `${name}, ${subtitle}` : name
}

function isHyperspaceCard(card: any): boolean {
  return !!(card?.isHyperspace || (typeof card?.variantType === 'string' && card.variantType.includes('Hyperspace')))
}

// Unit-side (landscape) art is the deployed-leader version; fall back to front.
function leaderArtUrl(card: any): string | null {
  return card?.backImageUrl || card?.imageUrl || null
}

export interface LeaderArtIndex {
  bySet: Map<string, { art: string; hs: boolean }>
  byFull: Map<string, { art: string; hs: boolean }>
}

/** Pure: build the name→art index from a card list. Hyperspace art wins ties. */
export function buildLeaderArtIndex(cards: any[]): LeaderArtIndex {
  const bySet = new Map<string, { art: string; hs: boolean }>()
  const byFull = new Map<string, { art: string; hs: boolean }>()
  const consider = (map: Map<string, { art: string; hs: boolean }>, key: string, art: string, hs: boolean) => {
    if (!art) return
    const current = map.get(key)
    // Prefer the Hyperspace printing; otherwise the first non-null art wins.
    if (!current || (hs && !current.hs)) map.set(key, { art, hs })
  }
  for (const card of cards || []) {
    const isLeader = card?.isLeader || card?.type === 'Leader'
    if (!isLeader || !card?.name) continue
    const art = leaderArtUrl(card)
    if (!art) continue
    const hs = isHyperspaceCard(card)
    const set = String(card.set ?? '').trim().toUpperCase()
    const full = norm(fullLeaderName(card))
    const bare = norm(card.name)
    consider(bySet, `${set}::${full}`, art, hs)
    consider(bySet, `${set}::${bare}`, art, hs)
    consider(byFull, full, art, hs)
  }
  return { bySet, byFull }
}

/** Pure: resolve leader art for a name (+ optional set hint) against an index. */
export function resolveLeaderArt(index: LeaderArtIndex, name: string | null | undefined, setCode: string | null | undefined): string | null {
  if (!name || !index) return null
  // The name may arrive full ("Darth Vader, Unstoppable", from the plugin) or
  // bare ("Darth Vader", from a deck card). The index holds BOTH forms per card
  // keyed by set, so a single lookup matches either. We never strip the subtitle
  // to guess — that could resolve a different leader (a different Vader) entirely.
  const set = String(setCode ?? '').trim().toUpperCase()
  const key = norm(name)
  const hit =
    index.bySet.get(`${set}::${key}`) ||  // the leader in the match's set (player decks; same-set opponents)
    index.byFull.get(key) ||              // the leader in ANY set (opponents playing off-set leaders)
    null
  return hit ? hit.art : null
}

let cachedIndex: LeaderArtIndex | null = null
function getIndex(): LeaderArtIndex {
  if (!cachedIndex) cachedIndex = buildLeaderArtIndex(getAllCards())
  return cachedIndex
}

/** Leader landscape art by name + set (Hyperspace preferred, normal fallback), or null. */
export function hyperspaceLeaderArt(name: string | null | undefined, setCode: string | null | undefined): string | null {
  return resolveLeaderArt(getIndex(), name, setCode)
}

/** Same, given a saved card object ({ name, subtitle, set } or { ..., setCode }). */
export function hyperspaceLeaderArtForCard(card: any): string | null {
  if (!card) return null
  return resolveLeaderArt(getIndex(), fullLeaderName(card), card.set || card.setCode)
}
