// @ts-nocheck
/**
 * Card Sorting Service
 *
 * Pure functions for sorting cards by various criteria.
 * Extracted from app/pool/[shareId]/deck/play/page.js
 *
 * All functions are pure: same input = same output, no side effects.
 */

import type { RawCard } from '../../utils/cardData'

type SortOption = 'aspect' | 'cost' | 'name'

/**
 * Aspect priority for sorting
 * Lower number = appears first
 */
const ASPECT_PRIORITY: Record<string, number> = {
  'Vigilance': 1,
  'Command': 2,
  'Aggression': 3,
  'Cunning': 4,
  'Villainy': 5,
  'Heroism': 6,
}

const PRIMARY_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

/**
 * Generate a sort key for a card based on its aspects.
 * Used to group cards by aspect combination.
 *
 * Sort order:
 * 1. Primary aspect (Vigilance < Command < Aggression < Cunning)
 * 2. Within primary: single aspect < with Villainy < with Heroism < double primary
 * 3. Neutral/no primary aspect last
 *
 * @param card - Card object
 * @returns Sort key for the card
 *
 * @example
 * getAspectSortKey({ aspects: ['Vigilance'] }) // => "1_04_Vigilance"
 * getAspectSortKey({ aspects: ['Vigilance', 'Villainy'] }) // => "1_01_Vigilance_Villainy"
 * getAspectSortKey({ aspects: ['Villainy'] }) // => "E_01_Villainy"
 */
export function getAspectSortKey(card: RawCard): string {
  const aspects = card.aspects || []

  if (aspects.length === 0) return 'E_99_Neutral'

  const hasVillainy = aspects.includes('Villainy')
  const hasHeroism = aspects.includes('Heroism')
  const primaries = aspects.filter(a => PRIMARY_ASPECTS.includes(a))
  // Sort uniquePrimaries by game priority so the bucket prefix is independent of
  // the source array order. The SWU API returns the same multi-primary card with
  // differently-ordered aspect arrays across variants (e.g. LAW Finn Normal is
  // ["Cunning","Vigilance"] but Hyperspace is ["Vigilance","Cunning"]).
  const uniquePrimaries = [...new Set(primaries)].sort(
    (a, b) => (ASPECT_PRIORITY[a] || 99) - (ASPECT_PRIORITY[b] || 99)
  )
  const primaryAspect = uniquePrimaries[0]

  // Sort aspects by game priority order for key suffix
  const sortedAspects = [...aspects].sort((a, b) =>
    (ASPECT_PRIORITY[a] || 99) - (ASPECT_PRIORITY[b] || 99)
  )
  // Use numeric priorities for suffix so sort is by priority, not alphabetical
  const aspectSuffix = sortedAspects.map(a => String(ASPECT_PRIORITY[a] || 99).padStart(2, '0')).join('_')

  // Multi-primary (2+ distinct primary aspects) — comes FIRST within the lowest primary
  if (uniquePrimaries.length >= 2) {
    const prefix = ASPECT_PRIORITY[primaryAspect] || '9'
    return `${prefix}_00_${aspectSuffix}`
  }

  // Single aspect
  if (aspects.length === 1) {
    const aspect = aspects[0]
    if (!aspect) return 'E_99_Neutral'
    if (aspect === 'Villainy') return 'E_01_Villainy'
    if (aspect === 'Heroism') return 'E_02_Heroism'
    return `${ASPECT_PRIORITY[aspect] || '9'}_04_${aspect}`
  }

  // Two aspects with one primary
  if (aspects.length === 2 && primaryAspect) {
    const prefix = ASPECT_PRIORITY[primaryAspect] || '9'
    const primaryCount = aspects.filter(a => a === primaryAspect).length
    if (hasVillainy) {
      return `${prefix}_01_${aspectSuffix}`
    } else if (hasHeroism) {
      return `${prefix}_02_${aspectSuffix}`
    } else if (primaryCount === 2) {
      return `${prefix}_03_${aspectSuffix}`
    }
  }

  // Two non-primary aspects
  if (aspects.length === 2 && !primaryAspect) {
    return 'E_01_Villainy_Heroism'
  }

  // 3+ aspects with one primary (e.g., Vigilance+Villainy+Heroism)
  if (primaryAspect) {
    const prefix = ASPECT_PRIORITY[primaryAspect] || '9'
    let subOrder = '05'
    if (hasVillainy) subOrder = '01'
    else if (hasHeroism) subOrder = '02'
    return `${prefix}_${subOrder}_${aspectSuffix}`
  }

  if (hasVillainy) return 'E_01_Villainy_Multi'
  if (hasHeroism) return 'E_02_Heroism_Multi'
  return 'E_99_Neutral'
}

/**
 * Get type priority for sorting
 * Ground Unit < Space Unit < Upgrade < Event
 *
 * @param type - Card type
 * @returns Sort priority (lower = first)
 */
export function getTypeOrder(type: string): number {
  if (type === 'Unit' || type === 'Ground Unit') return 1
  if (type === 'Space Unit') return 2
  if (type === 'Upgrade') return 3
  if (type === 'Event') return 4
  return 99
}

/**
 * Compare function for sorting cards by:
 * 1. Aspect combination
 * 2. Type (Ground Unit < Space Unit < Upgrade < Event)
 * 3. Cost (ascending)
 * 4. Name (alphabetical)
 *
 * @param a - First card
 * @param b - Second card
 * @returns Comparison result (-1, 0, 1)
 *
 * @example
 * cards.sort(compareByAspectTypeCostName)
 */
export function compareByAspectTypeCostName(a: RawCard, b: RawCard): number {
  // Aspect combination
  const aspectKeyA = getAspectSortKey(a)
  const aspectKeyB = getAspectSortKey(b)
  const aspectCompare = aspectKeyA.localeCompare(aspectKeyB)
  if (aspectCompare !== 0) return aspectCompare

  // Type
  const aTypeOrder = getTypeOrder(a.type || '')
  const bTypeOrder = getTypeOrder(b.type || '')
  if (aTypeOrder !== bTypeOrder) return aTypeOrder - bTypeOrder

  // Cost (low to high, nullish values last)
  const costA = a.cost !== null && a.cost !== undefined ? a.cost : 999
  const costB = b.cost !== null && b.cost !== undefined ? b.cost : 999
  if (costA !== costB) return costA - costB

  // Alphabetically by name
  const nameA = (a.name || '').toLowerCase()
  const nameB = (b.name || '').toLowerCase()
  return nameA.localeCompare(nameB)
}

/**
 * Compare function for sorting by cost then name
 *
 * @param a - First card
 * @param b - Second card
 * @returns Comparison result
 */
export function compareByCostName(a: RawCard, b: RawCard): number {
  const costA = a.cost !== null && a.cost !== undefined ? a.cost : 999
  const costB = b.cost !== null && b.cost !== undefined ? b.cost : 999
  if (costA !== costB) return costA - costB

  const nameA = (a.name || '').toLowerCase()
  const nameB = (b.name || '').toLowerCase()
  return nameA.localeCompare(nameB)
}

/**
 * Compare function for sorting by name only
 *
 * @param a - First card
 * @param b - Second card
 * @returns Comparison result
 */
export function compareByName(a: RawCard, b: RawCard): number {
  const nameA = (a.name || '').toLowerCase()
  const nameB = (b.name || '').toLowerCase()
  return nameA.localeCompare(nameB)
}

/**
 * Sort cards by aspect, type, cost, and name.
 * Creates a new array (does not mutate input).
 *
 * @param cards - Array of cards to sort
 * @returns New sorted array
 *
 * @example
 * const sorted = sortByAspect(myCards)
 */
export function sortByAspect(cards: RawCard[]): RawCard[] {
  return [...cards].sort(compareByAspectTypeCostName)
}

/**
 * Sort cards by cost then name.
 * Creates a new array (does not mutate input).
 *
 * @param cards - Array of cards to sort
 * @returns New sorted array
 */
export function sortByCost(cards: RawCard[]): RawCard[] {
  return [...cards].sort(compareByCostName)
}

/**
 * Sort cards alphabetically by name.
 * Creates a new array (does not mutate input).
 *
 * @param cards - Array of cards to sort
 * @returns New sorted array
 */
export function sortByName(cards: RawCard[]): RawCard[] {
  return [...cards].sort(compareByName)
}

/**
 * Sort cards using the specified sort option.
 *
 * @param cards - Array of cards to sort
 * @param sortBy - Sort method
 * @returns New sorted array
 */
export function sortCards(cards: RawCard[], sortBy: SortOption = 'aspect'): RawCard[] {
  switch (sortBy) {
    case 'cost':
      return sortByCost(cards)
    case 'name':
      return sortByName(cards)
    case 'aspect':
    default:
      return sortByAspect(cards)
  }
}

// Aliases for backwards compatibility
export const getDefaultAspectSortKey = getAspectSortKey
export const defaultSort = compareByAspectTypeCostName
