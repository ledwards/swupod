/**
 * Kit statistics shared by every column of the pack comparison.
 *
 * A kit is six packs a player opens together: leaders, bases and deck cards.
 * Different printings of a card are the same card, so a hyperspace copy of a
 * common already in the kit is a repeat. Every metric is a count per kit.
 */

import type { MetricId } from '../../services/compsScore'

export const RARITIES = ['Legendary', 'Rare', 'Special', 'Uncommon', 'Common'] as const
export type Rarity = typeof RARITIES[number]

export type Group = 'deck' | 'leader' | 'base'
export type Treatment = 'Normal' | 'Hyperspace' | 'Hyperspace Foil' | 'Foil' | 'Showcase' | 'Prestige'

export interface KitCard {
  name: string
  subtitle?: string | null | undefined
  rarity: string
  group: Group
  treatment: Treatment
}

export interface KitStat {
  /** Deck-card identities that appear more than once in the kit. */
  repeats: number
  values: Record<MetricId, number>
}

export function identity(c: Pick<KitCard, 'name' | 'subtitle'>): string {
  return `${c.name}|${c.subtitle || ''}`
}

/** Map any variant label (ours, a site's, a transcription's) to a treatment. */
export function treatmentOf(variant: string | undefined): Treatment {
  const v = variant || 'Normal'
  if (/Prestige/.test(v)) return 'Prestige'
  if (v === 'Hyperspace Foil') return 'Hyperspace Foil'
  if (v === 'Hyperspace') return 'Hyperspace'
  if (v === 'Showcase') return 'Showcase'
  if (v === 'Foil') return 'Foil'
  return 'Normal'
}

/** Identities seen more than once: all of them, same-printing ones, and by rarity. */
function repeatsIn(cards: KitCard[]): { all: number, same: number, byRarity: Record<string, number> } {
  const byId = new Map<string, KitCard[]>()
  for (const c of cards) {
    const id = identity(c)
    const list = byId.get(id)
    if (list) list.push(c)
    else byId.set(id, [c])
  }
  let all = 0, same = 0
  const byRarity: Record<string, number> = {}
  for (const copies of byId.values()) {
    if (copies.length < 2) continue
    all++
    const ts = copies.map(c => c.treatment)
    if (ts.some((t, i) => ts.indexOf(t) !== i)) same++
    const r = copies[0]!.rarity
    byRarity[r] = (byRarity[r] || 0) + 1
  }
  return { all, same, byRarity }
}

export function kitStat(cards: KitCard[]): KitStat {
  const deck = cards.filter(c => c.group === 'deck')
  const leaders = cards.filter(c => c.group === 'leader')
  const bases = cards.filter(c => c.group === 'base')
  const count = (xs: KitCard[], f: (c: KitCard) => boolean) => xs.filter(f).length
  const fancy = (c: KitCard) => c.treatment === 'Hyperspace' || c.treatment === 'Hyperspace Foil' || c.treatment === 'Showcase'
  const deckRepeats = repeatsIn(deck)
  const values: Record<MetricId, number> = {
    repeatedCommon: deckRepeats.byRarity.Common || 0,
    repeatedUncommon: deckRepeats.byRarity.Uncommon || 0,
    repeatedRarePlus: (deckRepeats.byRarity.Rare || 0) + (deckRepeats.byRarity.Legendary || 0) + (deckRepeats.byRarity.Special || 0),
    samePrinting: deckRepeats.same,
    legendary: count(deck, c => c.rarity === 'Legendary'),
    rare: count(deck, c => c.rarity === 'Rare'),
    special: count(deck, c => c.rarity === 'Special'),
    uncommon: count(deck, c => c.rarity === 'Uncommon'),
    common: count(deck, c => c.rarity === 'Common'),
    hyperspace: count(deck, c => c.treatment === 'Hyperspace'),
    hyperspaceFoil: count(deck, c => c.treatment === 'Hyperspace Foil'),
    plainFoil: count(deck, c => c.treatment === 'Foil'),
    prestige: count(deck, c => c.treatment === 'Prestige'),
    hyperspaceRare: count(deck, c => (c.treatment === 'Hyperspace' || c.treatment === 'Hyperspace Foil') && c.rarity !== 'Common' && c.rarity !== 'Uncommon'),
    leaders: leaders.length,
    bases: bases.length,
    rareLeaders: count(leaders, c => c.rarity !== 'Common'),
    hyperspaceLeaders: count(leaders, fancy),
    hyperspaceBases: count(bases, fancy),
    leaderRepeats: repeatsIn(leaders).all,
    baseRepeats: repeatsIn(bases).all,
  }
  return { repeats: deckRepeats.all, values }
}

/** Mean, sample SD and count of one metric over many kits. */
export interface Moment { mean: number, sd: number, n: number }

export interface KitSummary {
  kits: number
  repeatsHistogram: number[]
  meanRepeats: number
  crowded: number
  metrics: Partial<Record<MetricId, Moment>>
}

export function moment(xs: number[]): Moment {
  const n = xs.length
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, n - 1))
  return { mean: Number(mean.toFixed(4)), sd: Number(sd.toFixed(4)), n }
}

/**
 * Summarize kits. `only` limits which metrics are reported — a site that
 * does not model a part of the pack must not be credited with zeros it never
 * measured.
 */
export function summarize(stats: KitStat[], only?: MetricId[]): KitSummary {
  const n = stats.length
  if (!n) throw new Error('summarize: no kits')
  const max = Math.max(...stats.map(s => s.repeats))
  const repeatsHistogram = Array.from({ length: max + 1 }, () => 0)
  for (const s of stats) repeatsHistogram[s.repeats] = repeatsHistogram[s.repeats]! + 1
  const metrics: Partial<Record<MetricId, Moment>> = {}
  for (const id of only ?? (Object.keys(stats[0]!.values) as MetricId[])) {
    metrics[id] = moment(stats.map(s => s.values[id]))
  }
  const reps = stats.map(s => s.repeats)
  return {
    kits: n,
    repeatsHistogram,
    meanRepeats: reps.reduce((a, b) => a + b, 0) / n,
    crowded: reps.filter(r => r >= 10).length / n,
    metrics,
  }
}
