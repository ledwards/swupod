/**
 * Set catalog (/sets/[setCode]) ordering and grouping. Pure.
 */
import type { RawCard } from '../../utils/cardData'
import { getAspectSortKey, getTypeOrder } from './cardSorting'

/** The fields the catalog reads; real cards and placeholder slots both fit. */
export interface CatalogCard {
  id: string
  name: string
  type?: string
  aspects?: string[]
  cost?: number | null
  rarity?: string
  isLeader?: boolean
  isBase?: boolean
  isPlaceholder?: boolean
  placeholderGroup?: 'leader' | 'base' | 'main'
  placeholderBucketLabel?: string
  placeholderSlotIndex?: number
  imageUrl?: string
  [key: string]: unknown
}

const aspectKey = (card: CatalogCard): string => getAspectSortKey(card as unknown as RawCard)

/**
 * Comparator for the set page.
 *
 * Mirrors the default aspect sort (aspect → type → cost → name) used elsewhere
 * in the app, with one twist: placeholders sit at the END of their aspect
 * bucket. We don't know placeholders' collector numbers, but we do know their
 * aspect, so we infer their position by treating them as if their name comes
 * after every real card in that aspect — exactly as the user described.
 *
 * Sub-sort within placeholders: rarity → group → bucket label, so equivalent
 * unknown slots cluster together (e.g. all the Common Vigilance Unknowns sit
 * next to each other).
 */
const RARITY_ORDER: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Legendary: 4,
  Special: 5,
}

const GROUP_ORDER: Record<string, number> = {
  leader: 1,
  base: 2,
  main: 3,
}

function isLeader(card: CatalogCard): boolean {
  return Boolean(card.isLeader) || card.type === 'Leader'
}

export function compareCatalogCards(a: CatalogCard, b: CatalogCard): number {
  // Leaders ALWAYS go first (real and placeholder). The deck's centerpiece
  // sits at the top of the page no matter the aspect.
  const leaderA = isLeader(a) ? 0 : 1
  const leaderB = isLeader(b) ? 0 : 1
  if (leaderA !== leaderB) return leaderA - leaderB

  // Aspect bucket — same key function used by the deck builder's default sort.
  const aspectCmp = aspectKey(a).localeCompare(aspectKey(b))
  if (aspectCmp !== 0) return aspectCmp

  // Placeholders go AFTER real cards within their aspect bucket.
  if (a.isPlaceholder !== b.isPlaceholder) {
    return a.isPlaceholder ? 1 : -1
  }

  if (a.isPlaceholder && b.isPlaceholder) {
    // Within placeholders: stable, predictable clustering.
    const rarityCmp = (RARITY_ORDER[a.rarity ?? ''] || 99) - (RARITY_ORDER[b.rarity ?? ''] || 99)
    if (rarityCmp !== 0) return rarityCmp
    const groupCmp = (GROUP_ORDER[a.placeholderGroup ?? ''] || 99) - (GROUP_ORDER[b.placeholderGroup ?? ''] || 99)
    if (groupCmp !== 0) return groupCmp
    const labelA = a.placeholderBucketLabel || a.name || ''
    const labelB = b.placeholderBucketLabel || b.name || ''
    const labelCmp = labelA.localeCompare(labelB)
    if (labelCmp !== 0) return labelCmp
    return (a.placeholderSlotIndex || 0) - (b.placeholderSlotIndex || 0)
  }

  // Real cards: standard default sort tail — type, cost, name.
  const typeCmp = getTypeOrder(a.type || '') - getTypeOrder(b.type || '')
  if (typeCmp !== 0) return typeCmp
  const costA = a.cost ?? 999
  const costB = b.cost ?? 999
  if (costA !== costB) return costA - costB
  return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
}

export interface CatalogGroup<C extends CatalogCard = CatalogCard> {
  key: string
  label: string
  /** The aspect whose icon heads the group; null for Leaders, Bases and Neutral. */
  aspect: string | null
  cards: C[]
}

const PRIMARY_BY_PREFIX: Record<string, string> = { '1': 'Vigilance', '2': 'Command', '3': 'Aggression', '4': 'Cunning' }

/** The aspect group a main-deck card belongs to, read off its aspect sort key. */
function aspectGroupOf(card: CatalogCard): string {
  const key = aspectKey(card)
  const primary = PRIMARY_BY_PREFIX[key.charAt(0)]
  if (primary) return primary
  if (key.startsWith('E_01')) return 'Villainy'
  if (key.startsWith('E_02')) return 'Heroism'
  return 'Neutral'
}

function isBase(card: CatalogCard): boolean {
  return Boolean(card.isBase) || card.type === 'Base' || card.placeholderGroup === 'base'
}

/**
 * Splits cards already in catalog order into Leaders, Bases, then one group
 * per aspect, keeping that order inside every group. Empty groups are dropped.
 */
export function groupCatalogCards<C extends CatalogCard>(sorted: C[]): CatalogGroup<C>[] {
  const leaders: C[] = []
  const bases: C[] = []
  const byAspect = new Map<string, C[]>()
  for (const card of sorted) {
    if (isLeader(card) || card.placeholderGroup === 'leader') leaders.push(card)
    else if (isBase(card)) bases.push(card)
    else {
      const aspect = aspectGroupOf(card)
      byAspect.set(aspect, [...(byAspect.get(aspect) ?? []), card])
    }
  }
  const groups: CatalogGroup<C>[] = [
    { key: 'leaders', label: 'Leaders', aspect: null, cards: leaders },
    { key: 'bases', label: 'Bases', aspect: null, cards: bases },
    ...['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism', 'Neutral'].map(aspect => ({
      key: aspect.toLowerCase(),
      label: aspect,
      aspect: aspect === 'Neutral' ? null : aspect,
      cards: byAspect.get(aspect) ?? [],
    })),
  ]
  return groups.filter(g => g.cards.length > 0)
}
