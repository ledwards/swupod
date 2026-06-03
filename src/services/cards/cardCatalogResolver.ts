// @ts-nocheck
/**
 * Resolve stored card JSON against the current catalog.
 *
 * Pools and drafts intentionally store card objects in JSONB. During spoiler
 * season those objects may be ASH bucket placeholders. This resolver lets API
 * reads hydrate stale stored objects to the newest catalog card or resolve old
 * bucket slots to matching spoiled cards without rewriting historical DB rows.
 */

import { getAllCards, type RawCard } from '../../utils/cardData'
import { buildCardLookupMaps, normalizeCardId } from '../../utils/cardNormalization'
import { ASH_SET_CODE, getAshBucketId, getAshCardBucketId } from './ashPlaceholderCatalog'

const INSTANCE_FIELDS = [
  'instanceId',
  'pickNumber',
  'packNumber',
  'pickInPack',
  'leaderRound',
  'packIndex',
  'cardIndex',
]

const TREATMENT_FIELDS = [
  'variantType',
  'isFoil',
  'isHyperspace',
  'isShowcase',
  'isPrestige',
  'prestigeTier',
]

let cachedLookup: Map<string, RawCard> | null = null

function getLookup(): Map<string, RawCard> {
  if (!cachedLookup) {
    cachedLookup = buildCardLookupMaps(getAllCards()).cardMap
  }
  return cachedLookup
}

export function resetCatalogResolverCache(): void {
  cachedLookup = null
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCardLike(value: unknown): value is Record<string, any> {
  if (!isPlainObject(value)) return false
  return Boolean(
    ('id' in value || 'cardId' in value || 'number' in value) &&
    ('name' in value || 'set' in value || 'variantType' in value || 'rarity' in value || 'type' in value)
  )
}

function lookupStoredCard(card: Record<string, any>, lookup: Map<string, RawCard>): RawCard | null {
  if (card.id && lookup.has(card.id)) return lookup.get(card.id)!
  if (card.cardId && lookup.has(card.cardId)) return lookup.get(card.cardId)!
  const normalized = normalizeCardId(card.cardId)
  if (normalized && lookup.has(normalized)) return lookup.get(normalized)!
  return null
}

function uniqueLookupCards(lookup: Map<string, RawCard>): RawCard[] {
  const seen = new Set<string>()
  const cards: RawCard[] = []
  for (const card of lookup.values()) {
    if (!card?.id || seen.has(card.id)) continue
    seen.add(card.id)
    cards.push(card)
  }
  return cards
}

function sortRealAshCards(cards: RawCard[]): RawCard[] {
  return [...cards].sort((a, b) => {
    const numberA = Number(a.number)
    const numberB = Number(b.number)
    if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
      return numberA - numberB
    }
    return String(a.name || a.id).localeCompare(String(b.name || b.id))
  })
}

function resolveAshBucketPlaceholder(card: Record<string, any>, lookup: Map<string, RawCard>): RawCard | null {
  if (card.set !== ASH_SET_CODE || card.isPlaceholder !== true) return null
  const bucketId = card.placeholderBucketId || getAshCardBucketId(card)
  const slotIndex = Number(card.placeholderSlotIndex)
  if (!bucketId || !Number.isFinite(slotIndex) || slotIndex < 1) return null

  const catalogCards = uniqueLookupCards(lookup)
  const currentPlaceholders = catalogCards.filter(c =>
    c.set === ASH_SET_CODE &&
    c.isPlaceholder === true &&
    c.placeholderBucketId === bucketId
  )

  const remainingPlaceholderCount = currentPlaceholders.length
  if (slotIndex <= remainingPlaceholderCount) {
    return currentPlaceholders.find(c => c.placeholderSlotIndex === slotIndex) || null
  }

  let realCandidates = sortRealAshCards(catalogCards.filter(c =>
    c.set === ASH_SET_CODE &&
    c.isPlaceholder !== true &&
    getAshCardBucketId(c) === bucketId
  ))

  // Pre-release fallback: when a stored placeholder targets a Hyperspace /
  // Hyperspace Foil bucket but those variants haven't shipped yet, fall back
  // to the equivalent Normal-variant bucket. resolveStoredCard re-stamps the
  // stored treatment flags (variantType / isHyperspace / isFoil) onto the
  // resolved card, so the slot still renders as Hyperspace using Normal art.
  // Mirrors the HyperspaceLeaderBelt / HyperspaceCommonBelt fallback pattern.
  if (realCandidates.length === 0 && card.variantType && card.variantType !== 'Normal') {
    const normalBucketId = getAshBucketId({
      group: card.placeholderGroup,
      rarity: card.rarity,
      aspects: card.aspects,
      variantType: 'Normal',
    })
    realCandidates = sortRealAshCards(catalogCards.filter(c =>
      c.set === ASH_SET_CODE &&
      c.isPlaceholder !== true &&
      getAshCardBucketId(c) === normalBucketId
    ))
  }

  const resolvedIndex = slotIndex - remainingPlaceholderCount - 1
  return realCandidates[resolvedIndex] || null
}

export function resolveStoredCard(card: Record<string, any>, lookup: Map<string, RawCard> = getLookup()): Record<string, any> {
  const catalogCard = lookupStoredCard(card, lookup) || resolveAshBucketPlaceholder(card, lookup)
  if (!catalogCard) return card

  const resolved = {
    ...card,
    ...catalogCard,
  }

  for (const field of INSTANCE_FIELDS) {
    if (card[field] !== undefined) resolved[field] = card[field]
  }

  for (const field of TREATMENT_FIELDS) {
    if (card[field] !== undefined && catalogCard[field] === undefined) {
      resolved[field] = card[field]
    }
  }

  // Synthesized pack treatments reuse the base card ID with treatment flags.
  // Preserve those flags so a resolved hyperfoil/prestige pull stays visually
  // the same while still getting current card name/text/aspects.
  if (card.variantType && card.variantType !== catalogCard.variantType) {
    for (const field of TREATMENT_FIELDS) {
      if (card[field] !== undefined) resolved[field] = card[field]
    }
  }

  return resolved
}

export function resolveCatalogCards<T>(value: T, lookup: Map<string, RawCard> = getLookup()): T {
  if (Array.isArray(value)) {
    return value.map(item => resolveCatalogCards(item, lookup)) as T
  }

  if (isCardLike(value)) {
    return resolveStoredCard(value, lookup) as T
  }

  if (isPlainObject(value)) {
    const resolved: Record<string, any> = {}
    for (const [key, nested] of Object.entries(value)) {
      resolved[key] = resolveCatalogCards(nested, lookup)
    }
    return resolved as T
  }

  return value
}

export function collectPlaceholderCards(value: unknown, lookup: Map<string, RawCard> = getLookup()): Record<string, any>[] {
  const found = new Map<string, Record<string, any>>()

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (isCardLike(node)) {
      const resolved = resolveStoredCard(node, lookup)
      if (resolved.isPlaceholder === true) {
        found.set(resolved.id || resolved.cardId || resolved.name, resolved)
      }
      return
    }

    if (isPlainObject(node)) {
      Object.values(node).forEach(visit)
    }
  }

  visit(value)
  return Array.from(found.values())
}

export function containsPlaceholderCards(value: unknown, lookup: Map<string, RawCard> = getLookup()): boolean {
  return collectPlaceholderCards(value, lookup).length > 0
}

export function describePlaceholderCards(value: unknown, limit = 5): string {
  const placeholders = collectPlaceholderCards(value)
  return placeholders
    .slice(0, limit)
    .map(card => card.cardId || card.name || card.id)
    .join(', ')
}
