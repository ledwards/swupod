// @ts-nocheck
/**
 * Card Filtering Service
 *
 * Pure functions for filtering cards by various criteria.
 * Extracted from DeckBuilder.jsx for testability and reuse.
 */

import type { RawCard } from '../../utils/cardData'

/**
 * Default label for cards with no aspects (neutral cards)
 */
export const NO_ASPECT_LABEL = 'No Aspect'

/**
 * All possible aspect values
 */
export const ALL_ASPECTS = [
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Villainy',
  'Heroism',
] as const

export type Aspect = typeof ALL_ASPECTS[number]

export type AspectFilters = Record<string, boolean>

/**
 * Check if a card matches the enabled aspect filters.
 *
 * @param card - The card to check
 * @param enabledAspects - Map of aspect name to boolean (true = enabled)
 * @param neutralLabel - Label used for cards with no aspects
 * @returns True if card matches at least one enabled aspect
 *
 * @example
 * matchesAspectFilters(
 *   { aspects: ['Vigilance'] },
 *   { Vigilance: true, Command: false },
 *   'No Aspect'
 * ) // => true
 */
export function matchesAspectFilters(
  card: RawCard,
  enabledAspects: AspectFilters,
  neutralLabel: string = NO_ASPECT_LABEL
): boolean {
  const cardAspects = card.aspects || []

  // If card has no aspects, check the neutral filter
  if (cardAspects.length === 0) {
    return enabledAspects[neutralLabel] === true
  }

  // Card must have at least one aspect that's enabled
  return cardAspects.some(aspect => enabledAspects[aspect] === true)
}

/**
 * Check if a card passes the in-aspect/out-of-aspect filter.
 *
 * @param penalty - The aspect penalty for the card (0 = in-aspect)
 * @param inAspectEnabled - Whether to show in-aspect cards
 * @param outAspectEnabled - Whether to show out-of-aspect cards
 * @returns True if card passes the filter
 *
 * @example
 * matchesPenaltyFilter(0, true, false) // => true (in-aspect card, showing in-aspect)
 * matchesPenaltyFilter(2, true, false) // => false (out-of-aspect card, only showing in-aspect)
 * matchesPenaltyFilter(2, true, true) // => true (out-of-aspect card, showing both)
 */
export function matchesPenaltyFilter(
  penalty: number,
  inAspectEnabled: boolean,
  outAspectEnabled: boolean
): boolean {
  const isInAspect = penalty === 0
  const isOutOfAspect = penalty > 0

  // If neither filter is enabled, nothing passes
  if (!inAspectEnabled && !outAspectEnabled) {
    return false
  }

  // If only in-aspect is enabled, out-of-aspect cards fail
  if (inAspectEnabled && !outAspectEnabled && isOutOfAspect) {
    return false
  }

  // If only out-of-aspect is enabled, in-aspect cards fail
  if (!inAspectEnabled && outAspectEnabled && isInAspect) {
    return false
  }

  return true
}

/**
 * Filter an array of cards by aspect filters.
 *
 * @param cards - Array of cards to filter
 * @param enabledAspects - Map of aspect name to boolean
 * @param neutralLabel - Label for cards with no aspects
 * @returns Filtered array of cards
 */
export function filterByAspects(
  cards: RawCard[],
  enabledAspects: AspectFilters,
  neutralLabel: string = NO_ASPECT_LABEL
): RawCard[] {
  return cards.filter(card => matchesAspectFilters(card, enabledAspects, neutralLabel))
}

/**
 * Filter cards by type.
 *
 * @param cards - Array of cards to filter
 * @param types - Type or array of types to include
 * @returns Filtered array of cards
 *
 * @example
 * filterByType(cards, 'Unit') // => cards where type is 'Unit'
 * filterByType(cards, ['Unit', 'Ground Unit']) // => cards where type is 'Unit' or 'Ground Unit'
 */
export function filterByType(cards: RawCard[], types: string | string[]): RawCard[] {
  const typeArray = Array.isArray(types) ? types : [types]
  return cards.filter(card => typeArray.includes(card.type || ''))
}

/**
 * Filter cards by rarity.
 *
 * @param cards - Array of cards to filter
 * @param rarities - Rarity or array of rarities to include
 * @returns Filtered array of cards
 */
export function filterByRarity(cards: RawCard[], rarities: string | string[]): RawCard[] {
  const rarityArray = Array.isArray(rarities) ? rarities : [rarities]
  return cards.filter(card => rarityArray.includes(card.rarity || ''))
}

/**
 * Filter cards to only include leaders.
 *
 * @param cards - Array of cards to filter
 * @returns Only leader cards
 */
export function filterLeaders(cards: RawCard[]): RawCard[] {
  return cards.filter(card => card.isLeader || card.type === 'Leader')
}

/**
 * Filter cards to only include bases.
 *
 * @param cards - Array of cards to filter
 * @returns Only base cards
 */
export function filterBases(cards: RawCard[]): RawCard[] {
  return cards.filter(card => card.isBase || card.type === 'Base')
}

/**
 * Filter cards to exclude leaders and bases (main deck cards only).
 *
 * @param cards - Array of cards to filter
 * @returns Cards that are not leaders or bases
 */
export function filterMainDeckCards(cards: RawCard[]): RawCard[] {
  return cards.filter(card =>
    !card.isBase &&
    !card.isLeader &&
    card.type !== 'Base' &&
    card.type !== 'Leader'
  )
}

/**
 * Filter cards by cost range.
 *
 * @param cards - Array of cards to filter
 * @param minCost - Minimum cost (inclusive)
 * @param maxCost - Maximum cost (inclusive)
 * @returns Filtered array of cards
 */
export function filterByCostRange(cards: RawCard[], minCost: number, maxCost: number): RawCard[] {
  return cards.filter(card => {
    const cost = card.cost
    if (cost === null || cost === undefined) return false
    return cost >= minCost && cost <= maxCost
  })
}

/**
 * Filter cards by name (case-insensitive substring match).
 *
 * @param cards - Array of cards to filter
 * @param searchText - Text to search for in card names
 * @returns Filtered array of cards
 */
export function filterByName(cards: RawCard[], searchText: string): RawCard[] {
  if (!searchText || searchText.trim() === '') {
    return cards
  }
  const lowerSearch = searchText.toLowerCase()
  return cards.filter(card =>
    (card.name || '').toLowerCase().includes(lowerSearch)
  )
}

/**
 * Create default aspect filter state with all aspects enabled.
 *
 * @param defaultEnabled - Whether aspects should be enabled by default
 * @returns Map of aspect name to boolean
 */
export function createDefaultAspectFilters(defaultEnabled: boolean = true): AspectFilters {
  const filters: AspectFilters = {}
  for (const aspect of ALL_ASPECTS) {
    filters[aspect] = defaultEnabled
  }
  filters[NO_ASPECT_LABEL] = defaultEnabled
  return filters
}
