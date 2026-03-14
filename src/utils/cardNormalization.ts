// @ts-nocheck
/**
 * Card Normalization Utilities
 *
 * IMPORTANT: All stats, analytics, and bot code MUST treat card variants
 * (Normal, Foil, Hyperspace, Hyperspace Foil, Showcase) as the SAME card.
 *
 * A "Leia Organa" Hyperspace Foil is the same game piece as a "Leia Organa" Normal.
 * Stats should never count them separately.
 *
 * This module provides shared utilities for normalizing card identity:
 *
 * - `cardNameKey(card)` — canonical key: "Name|Type" (e.g. "Leia Organa|Leader")
 *   Type is included because the same name can be both a Leader and a Unit.
 *
 * - `buildCardLookupMaps(allCards)` — returns { cardMap, nameTypeToCard }
 *   cardMap: keyed by id, cardId, and normalized SET_XXX format
 *   nameTypeToCard: keyed by "Name|Type" → Normal variant card data
 *
 * - `normalizeCardId(rawId)` — converts "LAW-1" or "LAW_1" to "LAW_001"
 *
 * Usage in stats APIs:
 *   import { buildCardLookupMaps, cardNameKey } from '@/src/utils/cardNormalization'
 *   const { cardMap, nameTypeToCard } = buildCardLookupMaps(getAllCards())
 *
 * Usage in bot code:
 *   Bot code already groups by card.name which is correct.
 *   If you need type disambiguation, use cardNameKey(card).
 */

import type { RawCard } from './cardData'

/**
 * Canonical key for a card: "Name|Type"
 * Merges all variants (Normal, Foil, HS, HSF, Showcase) into one identity.
 * Type is included because "Leia Organa" can be both a Leader and a Unit.
 */
export function cardNameKey(card: { name: string; type?: string }): string {
  return `${card.name}|${card.type || ''}`
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
 * Build lookup maps for card data enrichment.
 *
 * Returns:
 * - cardMap: Map keyed by CMS id, raw cardId (e.g. "LAW-1"), and normalized
 *   cardId (e.g. "LAW_001"). Use for looking up any card by any ID format.
 *
 * - nameTypeToCard: Map keyed by "Name|Type" → first Normal variant found.
 *   Use for merging variants into a single canonical card for stats display.
 *   The Normal variant is preferred because it has the base cardId and imagery.
 */
export function buildCardLookupMaps(allCards: RawCard[]): {
  cardMap: Map<string, RawCard>
  nameTypeToCard: Map<string, RawCard>
} {
  const cardMap = new Map<string, RawCard>()
  const nameTypeToCard = new Map<string, RawCard>()

  for (const card of allCards) {
    cardMap.set(card.id, card)
    if (card.cardId) {
      const normalized = normalizeCardId(card.cardId)
      if (normalized) cardMap.set(normalized, card)
      cardMap.set(card.cardId, card)
    }
    if (card.variantType === 'Normal') {
      const key = cardNameKey(card)
      if (!nameTypeToCard.has(key)) {
        nameTypeToCard.set(key, card)
      }
    }
  }

  return { cardMap, nameTypeToCard }
}
