// @ts-nocheck
/**
 * Card Normalization Utilities
 *
 * IMPORTANT: All stats, analytics, and bot code MUST treat card variants
 * (Normal, Foil, Hyperspace, Hyperspace Foil, Showcase, Prestige) as the
 * SAME game piece. A "Leia Organa" Hyperspace Foil is the same card as
 * a "Leia Organa" Normal — they should never be counted separately.
 *
 * HOW VARIANTS RELATE TO BASE CARDS:
 * - Every card has a unique `id` (CMS ID) and `cardId` (e.g. "LAW-10")
 * - Variants of the same game piece share: name, type, AND subtitle
 * - They differ in: id, cardId, number, variantType
 * - Example: LAW Leia Organa Leader has id=46102 (Normal), 47437 (HS), 47582 (Showcase)
 * - The canonical key is `name|type|subtitle` (NOT just name|type)
 * - Why subtitle? "Anakin Skywalker|Unit" has TWO different cards in LOF:
 *   "Force Prodigy" (Special) and "Champion of Mortis" (Legendary)
 *
 * This module provides:
 *
 * - `cardIdentityKey(card)` — canonical key: "Name|Type|Subtitle"
 *   Uniquely identifies a game piece across all variants.
 *
 * - `buildCardLookupMaps(allCards)` — returns { cardMap, normalCardMap, toNormalCard }
 *   cardMap: any id/cardId → card data (for enrichment lookups)
 *   normalCardMap: identity key → Normal variant (for display/export)
 *   toNormalCard: any card id → its Normal variant (for variant merging)
 *
 * - `normalizeCardId(rawId)` — converts "LAW-1" or "LAW_1" to "LAW_001"
 *
 * Usage in stats APIs:
 *   import { buildCardLookupMaps, cardIdentityKey } from '@/src/utils/cardNormalization'
 *   const { cardMap, normalCardMap, toNormalCard } = buildCardLookupMaps(getAllCards())
 *   // Look up any card: cardMap.get(someId)
 *   // Get Normal variant: toNormalCard.get(someCard.id) or normalCardMap.get(cardIdentityKey(card))
 *   // Merge variants: group by cardIdentityKey(card)
 */

import type { RawCard } from './cardData'

/**
 * Canonical identity key for a card: "Name|Type|Subtitle"
 * Merges all variants (Normal, Foil, HS, HSF, Showcase, Prestige) into one identity.
 *
 * - Type is needed because "Leia Organa" can be both a Leader and a Unit
 * - Subtitle is needed because "Anakin Skywalker|Unit" can be two different cards
 *   in the same set (e.g. "Force Prodigy" vs "Champion of Mortis" in LOF)
 */
export function cardIdentityKey(card: { name: string; type?: string; subtitle?: string | null }): string {
  return `${card.name}|${card.type || ''}|${card.subtitle || ''}`
}

/**
 * Normalize a card ID to the standard SET_XXX format.
 * Handles both hyphen (LAW-1) and underscore (LAW_001) input formats.
 * Returns null if the input is falsy or unparseable.
 */
export function normalizeCardId(rawId: string | null | undefined): string | null {
  if (!rawId) return null
  const sep = rawId.includes('-') ? '-' : rawId.includes('_') ? '_' : null
  if (!sep) return rawId
  const [set, num] = rawId.split(sep)
  if (!set || !num) return rawId
  return `${set}_${num.padStart(3, '0')}`
}

/**
 * Build lookup maps for card data enrichment and variant normalization.
 *
 * Returns:
 * - cardMap: Map keyed by CMS id, raw cardId, and normalized cardId.
 *   Use for looking up any card by any ID format.
 *
 * - normalCardMap: Map keyed by identity key ("Name|Type|Subtitle") → Normal variant.
 *   Use for merging variants into a single canonical card for stats display.
 *
 * - toNormalCard: Map keyed by any card's CMS id → its Normal variant.
 *   Use to directly resolve any variant to its base card: toNormalCard.get(card.id)
 */
export function buildCardLookupMaps(allCards: RawCard[]): {
  cardMap: Map<string, RawCard>
  normalCardMap: Map<string, RawCard>
  toNormalCard: Map<string, RawCard>
} {
  const cardMap = new Map<string, RawCard>()
  const normalCardMap = new Map<string, RawCard>()

  // First pass: index all cards and find Normal variants
  for (const card of allCards) {
    cardMap.set(card.id, card)
    if (card.cardId) {
      const normalized = normalizeCardId(card.cardId)
      if (normalized) cardMap.set(normalized, card)
      cardMap.set(card.cardId, card)
    }
    if (card.variantType === 'Normal') {
      const key = cardIdentityKey(card)
      if (!normalCardMap.has(key)) {
        normalCardMap.set(key, card)
      }
    }
  }

  // Second pass: map every card id to its Normal variant
  const toNormalCard = new Map<string, RawCard>()
  for (const card of allCards) {
    const key = cardIdentityKey(card)
    const normal = normalCardMap.get(key)
    if (normal) {
      toNormalCard.set(card.id, normal)
    }
  }

  return { cardMap, normalCardMap, toNormalCard }
}
