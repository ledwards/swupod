/**
 * Meta stats for one deck: the format's card win rates (17lands-style, from
 * /api/stats/card-data) matched to the cards in this deck and its sideboard.
 */

import type { StatsCard } from './composition'

/** The card-data row fields the Meta tab reads. */
export interface CardMetaStats {
  cardName: string
  subtitle?: string | null
  displayGrade?: string | null
  gpWr?: number | null
  gpCount?: number | null
  ohWr?: number | null
  ohCount?: number | null
  gdWr?: number | null
  gdCount?: number | null
  gihWr?: number | null
  gihWins?: number | null
  gihCount?: number | null
  gnsWr?: number | null
  gnsCount?: number | null
  iih?: number | null
  playedRate?: number | null
  resourcedWhenSeen?: number | null
  playedWar?: number | null
  ata?: number | null
  pickRate?: number | null
}

export interface MetaRow {
  card: StatsCard
  copies: number
  inDeck: boolean
  stats: CardMetaStats | null
  /** GIH WR when the card has hand data, else GP WR; what the strip and sort use. */
  score: number | null
  /** Games behind `score`. */
  sample: number
}

/** Below this many games a card's win rate is shown but not trusted (Wayfinder's grade floor). */
export const MIN_META_SAMPLE = 50

const identity = (name?: string | null, subtitle?: string | null) => `${name || ''}|${subtitle || ''}`.toLowerCase()

export function metaScore(stats: CardMetaStats | null): { score: number | null; sample: number } {
  if (!stats) return { score: null, sample: 0 }
  if (stats.gihCount && stats.gihWr != null) return { score: stats.gihWr, sample: stats.gihCount }
  if (stats.gpCount && stats.gpWr != null) return { score: stats.gpWr, sample: stats.gpCount }
  return { score: null, sample: 0 }
}

/** Deck and sideboard cards grouped by name, each with its format stats, best score first. */
export function metaRows(deck: StatsCard[], sideboard: StatsCard[], cards: CardMetaStats[]): MetaRow[] {
  const byIdentity = new Map(cards.map(row => [identity(row.cardName, row.subtitle), row]))
  const byName = new Map(cards.map(row => [identity(row.cardName, null), row]))
  const rows = new Map<string, MetaRow>()
  const add = (card: StatsCard, inDeck: boolean) => {
    const key = `${identity(card.name, card.subtitle)}|${inDeck}`
    const existing = rows.get(key)
    if (existing) { existing.copies++; return }
    const stats = byIdentity.get(identity(card.name, card.subtitle)) ?? byName.get(identity(card.name, null)) ?? null
    rows.set(key, { card, copies: 1, inDeck, stats, ...metaScore(stats) })
  }
  deck.forEach(card => add(card, true))
  sideboard.forEach(card => add(card, false))
  return [...rows.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}

/** Format average: all game-in-hand wins over all game-in-hand games, falling back to the mean score. */
export function formatAverage(cards: CardMetaStats[]): number | null {
  let wins = 0
  let games = 0
  for (const row of cards) if (row.gihCount && row.gihWins != null) { wins += row.gihWins; games += row.gihCount }
  if (games > 0) return (wins / games) * 100
  const scores = cards.map(row => metaScore(row).score).filter((s): s is number => s != null)
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
}

/** Mean score of the deck's cards, counting copies, over cards that have one. */
export function deckAverage(rows: MetaRow[]): number | null {
  let total = 0
  let count = 0
  for (const row of rows) if (row.inDeck && row.score != null) { total += row.score * row.copies; count += row.copies }
  return count ? total / count : null
}

export interface SideboardUpgrade { out: MetaRow; in: MetaRow; gain: number }

/**
 * Sideboard cards that beat the weakest deck cards by at least `margin` points,
 * among cards with a trusted sample. `isPlayable` screens out sideboard cards
 * that would add an aspect penalty.
 */
export function sideboardUpgrades(rows: MetaRow[], isPlayable: (card: StatsCard) => boolean, { limit = 3, margin = 1.5 } = {}): SideboardUpgrade[] {
  const trusted = (row: MetaRow) => row.score != null && row.sample >= MIN_META_SAMPLE
  const weakest = rows.filter(row => row.inDeck && trusted(row)).sort((a, b) => a.score! - b.score!)
  const candidates = rows.filter(row => !row.inDeck && trusted(row) && isPlayable(row.card)).sort((a, b) => b.score! - a.score!)
  const upgrades: SideboardUpgrade[] = []
  const used = new Set<MetaRow>()
  for (const candidate of candidates) {
    const out = weakest.find(row => !used.has(row) && candidate.score! - row.score! >= margin)
    if (!out) continue
    used.add(out)
    upgrades.push({ out, in: candidate, gain: candidate.score! - out.score! })
    if (upgrades.length === limit) break
  }
  return upgrades
}
