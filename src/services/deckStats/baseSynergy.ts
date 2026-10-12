/**
 * Base-trait synergy: cards that turn on when you control a base with a given
 * trait (HMW: "While you control a Naboo base, ..."). Which traits a set uses
 * comes from its config (`SetConfig.baseTraitSynergy`).
 */

import type { StatsCard } from './composition'

export interface SynergyCard { name: string; aspects: string[]; count: number }
export interface SynergyTile {
  trait: string
  /** Deck cards that care about this base trait, grouped by name. */
  deck: SynergyCard[]
  /** Sideboard cards that care about it, grouped by name. */
  sideboard: SynergyCard[]
  deckCount: number
  poolCount: number
  bases: Array<{ name: string; aspects: string[] }>
  isCurrent: boolean
}

function cardText(card: StatsCard): string {
  return [card.frontText, card.backText, card.epicAction].filter(Boolean).join(' ')
}

/** "a Naboo base", "an Endor base", and lists like "Endor, Naboo, or Tatooine base". */
export function referencesBaseTrait(card: StatsCard, trait: string): boolean {
  return new RegExp(`\\b${trait}\\b[\\w ,']{0,50}?\\bbases?\\b`, 'i').test(cardText(card))
}

function group(cards: StatsCard[]): SynergyCard[] {
  const byName = new Map<string, SynergyCard>()
  for (const card of cards) {
    const entry = byName.get(card.name) || { name: card.name, aspects: card.aspects || [], count: 0 }
    entry.count++
    byName.set(card.name, entry)
  }
  return [...byName.values()]
}

export function baseSynergyTiles(input: {
  traits: string[]
  deck: StatsCard[]
  sideboard: StatsCard[]
  setBases: StatsCard[]
  currentBase: StatsCard | null
}): SynergyTile[] {
  const { traits, deck, sideboard, setBases, currentBase } = input
  return traits.map(trait => {
    const deckHits = deck.filter(card => referencesBaseTrait(card, trait))
    const sideHits = sideboard.filter(card => referencesBaseTrait(card, trait))
    const bases = setBases
      .filter(base => base.traits?.includes(trait))
      .map(base => ({ name: base.name, aspects: base.aspects || [] }))
    const uniqueBases = [...new Map(bases.map(base => [base.name, base])).values()]
    return {
      trait,
      deck: group(deckHits),
      sideboard: group(sideHits),
      deckCount: deckHits.length,
      poolCount: deckHits.length + sideHits.length,
      bases: uniqueBases,
      isCurrent: !!currentBase?.traits?.includes(trait),
    }
  })
}
