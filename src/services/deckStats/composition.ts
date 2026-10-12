/**
 * Deck composition stats: what's in the deck, measured against the whole pool.
 *
 * Pure. Every breakdown returns a `primary` count (the side drawn solid: the
 * deck, or the sideboard) next to a `pool` count (the dashed outline behind it),
 * so the UI can overlay the two in one chart.
 */

import { calculateAspectPenalty, getRelevantAspects } from '../cards/aspectPenalties'

export interface StatsCard {
  name: string
  subtitle?: string | null
  set?: string | null
  cost?: number | null
  aspects?: string[] | null
  type?: string | null
  arenas?: string[] | null
  rarity?: string | null
  traits?: string[] | null
  keywords?: string[] | null
  frontText?: string | null
  backText?: string | null
  epicAction?: string | null
}

export const ASPECT_ORDER = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism'] as const
export const NEUTRAL = 'Neutral'
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special'] as const
export const CARD_KINDS = ['ground', 'space', 'event', 'upgrade'] as const
export type CardKind = typeof CARD_KINDS[number]
/** Highest cost bucket; it holds that cost and everything above. */
export const CURVE_MAX = 7
/** Resources available on turn 1. */
export const T1_RESOURCES = 2

export interface OverlayCount { key: string; primary: number; pool: number }
export interface AspectRow extends OverlayCount { provided: boolean; penalized: boolean }
export interface CurveBucket { cost: number; primary: Record<CardKind, number>; primaryTotal: number; pool: number }

export function cardKind(card: StatsCard): CardKind | null {
  if (card.type === 'Unit') return card.arenas?.includes('Space') ? 'space' : 'ground'
  if (card.type === 'Event') return 'event'
  if (card.type === 'Upgrade') return 'upgrade'
  return null
}

function tally(cards: StatsCard[], keysOf: (card: StatsCard) => string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const card of cards) for (const key of keysOf(card)) counts[key] = (counts[key] || 0) + 1
  return counts
}

function overlay(primary: StatsCard[], pool: StatsCard[], keysOf: (card: StatsCard) => string[], keys: readonly string[]): OverlayCount[] {
  const p = tally(primary, keysOf)
  const q = tally(pool, keysOf)
  return keys.map(key => ({ key, primary: p[key] || 0, pool: q[key] || 0 }))
}

const aspectsOf = (card: StatsCard) => (card.aspects?.length ? card.aspects : [NEUTRAL])

export function averageCost(cards: StatsCard[]): number {
  if (cards.length === 0) return 0
  return cards.reduce((sum, card) => sum + (card.cost || 0), 0) / cards.length
}

export function aspectRows(primary: StatsCard[], pool: StatsCard[], leader: StatsCard | null, base: StatsCard | null): AspectRow[] {
  const provided = new Set(getRelevantAspects(leader as never, base as never))
  return overlay(primary, pool, card => [...new Set(aspectsOf(card))], [...ASPECT_ORDER, NEUTRAL])
    .filter(row => row.primary || row.pool)
    .map(row => ({
      ...row,
      provided: provided.has(row.key),
      penalized: row.key !== NEUTRAL && !provided.has(row.key) && row.primary > 0,
    }))
}

/**
 * Splits one aspect's cards by their full aspect combination. The key is the
 * partner aspect, the aspect itself for a doubled card (e.g. Vigilance ×2), or
 * '' for cards with that aspect alone.
 */
export function aspectPairings(aspect: string, primary: StatsCard[], pool: StatsCard[]): OverlayCount[] {
  const partner = (card: StatsCard) => {
    const rest = [...(card.aspects || [])]
    rest.splice(rest.indexOf(aspect), 1)
    return [rest[0] || '']
  }
  const has = (card: StatsCard) => !!card.aspects?.includes(aspect)
  const p = tally(primary.filter(has), partner)
  const q = tally(pool.filter(has), partner)
  return Object.keys({ ...p, ...q })
    .map(key => ({ key, primary: p[key] || 0, pool: q[key] || 0 }))
    .sort((a, b) => b.pool - a.pool || b.primary - a.primary)
}

export function costCurve(primary: StatsCard[], pool: StatsCard[]): CurveBucket[] {
  const bucket = (card: StatsCard) => Math.min(Math.max(card.cost || 0, 0), CURVE_MAX)
  return Array.from({ length: CURVE_MAX + 1 }, (_, cost) => {
    const at = primary.filter(card => bucket(card) === cost)
    const byKind = Object.fromEntries(CARD_KINDS.map(kind => [kind, at.filter(card => cardKind(card) === kind).length])) as Record<CardKind, number>
    return { cost, primary: byKind, primaryTotal: at.length, pool: pool.filter(card => bucket(card) === cost).length }
  })
}

export function kindRows(primary: StatsCard[], pool: StatsCard[]): OverlayCount[] {
  return overlay(primary, pool, card => { const kind = cardKind(card); return kind ? [kind] : [] }, CARD_KINDS)
}

/** All five rarities, always, so an empty Legendary or Special row still shows. */
export function rarityRows(primary: StatsCard[], pool: StatsCard[]): OverlayCount[] {
  return overlay(primary, pool, card => (card.rarity ? [card.rarity] : []), RARITY_ORDER)
}

/** Traits or keywords, most common in the primary side first. */
export function labelRows(primary: StatsCard[], pool: StatsCard[], field: 'traits' | 'keywords'): OverlayCount[] {
  const keysOf = (card: StatsCard) => [...new Set(card[field] || [])]
  const p = tally(primary, keysOf)
  const q = tally(pool, keysOf)
  return Object.keys({ ...p, ...q })
    .map(key => ({ key, primary: p[key] || 0, pool: q[key] || 0 }))
    .sort((a, b) => b.primary - a.primary || b.pool - a.pool || a.key.localeCompare(b.key))
}

export function penaltyOf(card: StatsCard, leader: StatsCard | null, base: StatsCard | null): number {
  if (!leader || !base) return 0
  return calculateAspectPenalty(card as never, leader as never, base as never)
}

export function isTurnOnePlay(card: StatsCard, leader: StatsCard | null, base: StatsCard | null): boolean {
  return (card.cost || 0) + penaltyOf(card, leader, base) <= T1_RESOURCES
}

export interface DeckSummary {
  deckCount: number
  poolCount: number
  avgCost: number
  poolAvgCost: number
  groundUnits: number
  spaceUnits: number
  turnOnePlays: number
  poolTurnOnePlays: number
  /** Unique names of deck cards paying an aspect penalty. */
  penaltyCards: string[]
  penaltyCount: number
}

export function deckSummary(deck: StatsCard[], pool: StatsCard[], leader: StatsCard | null, base: StatsCard | null): DeckSummary {
  const penalized = deck.filter(card => penaltyOf(card, leader, base) > 0)
  return {
    deckCount: deck.length,
    poolCount: pool.length,
    avgCost: averageCost(deck),
    poolAvgCost: averageCost(pool),
    groundUnits: deck.filter(card => cardKind(card) === 'ground').length,
    spaceUnits: deck.filter(card => cardKind(card) === 'space').length,
    turnOnePlays: deck.filter(card => isTurnOnePlay(card, leader, base)).length,
    poolTurnOnePlays: pool.filter(card => isTurnOnePlay(card, leader, base)).length,
    penaltyCards: [...new Set(penalized.map(card => card.name))],
    penaltyCount: penalized.length,
  }
}
