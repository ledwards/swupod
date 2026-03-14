// @ts-nocheck
/**
 * Variant Downgrade Utilities
 *
 * Converts variant cards (Hyperspace, Foil, Showcase, Hyperspace Foil) to their
 * Normal/base equivalents for export to external tools like swudb.com.
 *
 * Key concepts:
 * - Each card has multiple variants (Normal, Hyperspace, Foil, Showcase, etc.)
 * - All variants share the same name and type, but have different variantType
 * - For export, we need the Normal variant's cardId in SWUDB format (e.g., "SOR_011")
 * - SWUDB expects 3-digit zero-padded card numbers (SEC_012, not SEC_12)
 * - We use name+type as the key to find the base card, because some characters
 *   (like Leia Organa) exist as both Leaders and Units
 */

import { getCachedCards } from './cardCache'
import { cardIdentityKey } from './cardNormalization'
import type { RawCard } from './cardData'
import type { SetCode } from '../types'

/**
 * Format a cardId for SWUDB export.
 * Converts "SEC-12" to "SEC_012" (underscore + 3-digit zero-padded number).
 *
 * @param cardId - The card ID (e.g., "SEC-12" or "SOR-200")
 * @returns SWUDB-formatted ID (e.g., "SEC_012" or "SOR_200")
 */
function formatCardIdForExport(cardId: string): string | null {
  if (!cardId) return null

  // Split on hyphen to get set code and number
  const parts = cardId.split('-')
  if (parts.length !== 2) {
    // Fallback: just replace hyphen with underscore
    return cardId.replace(/-/g, '_')
  }

  const [setCode, numberStr] = parts
  const number = parseInt(numberStr!, 10)

  // Zero-pad to 3 digits for SWUDB compatibility
  const paddedNumber = number.toString().padStart(3, '0')

  return `${setCode}_${paddedNumber}`
}

/**
 * Build a map of card identity -> Normal variant card
 *
 * @param setCode - The set code (e.g., 'SOR')
 * @returns Map of "name|type|subtitle" -> Normal variant card
 */
export function buildBaseCardMap(setCode: SetCode | string | null | undefined): Map<string, RawCard> {
  // Handle null/undefined setCode
  if (!setCode) return new Map()

  // Handle comma-separated set codes (e.g., Chaos Sealed: "SOR,JTL,LOF")
  const setCodes = setCode.includes(',') ? setCode.split(',').map(s => s.trim()) : [setCode]
  let cards: RawCard[] = []
  for (const code of setCodes) {
    cards = cards.concat(getCachedCards(code as SetCode))
  }
  if (!cards || cards.length === 0) return new Map()

  const identityToBaseCard = new Map<string, RawCard>()

  cards.forEach(card => {
    // Only consider Normal variants as base cards
    if (card.variantType !== 'Normal') return

    // Use name|type|subtitle as key (see cardNormalization.ts)
    // Subtitle needed because e.g. LOF has two "Anakin Skywalker|Unit" cards
    const key = cardIdentityKey(card)

    if (!identityToBaseCard.has(key)) {
      identityToBaseCard.set(key, card)
    }
  })

  return identityToBaseCard
}

/**
 * Get the base card ID for export.
 *
 * Converts any variant card to its Normal equivalent's cardId in SWUDB format.
 * For example:
 * - Hyperspace "Leia Organa" Leader -> "SOR_008" (the Normal Leader's cardId)
 * - Foil "TIE Fighter" Unit -> "SOR_045" (the Normal Unit's cardId)
 *
 * @param card - The card to get the base ID for
 * @param baseCardMap - Map from buildBaseCardMap()
 * @returns The base card ID in SWUDB format (SET_XXX), or null if not found
 */
export function getBaseCardId(card: RawCard | null | undefined, baseCardMap?: Map<string, RawCard>): string | null {
  if (!card) return null

  // Look up the Normal variant by identity key (name|type|subtitle)
  const key = cardIdentityKey(card)
  const baseCard = baseCardMap?.get(key)

  if (baseCard && baseCard.cardId) {
    // Return cardId in SWUDB format (e.g., "SOR_011" with zero-padding)
    return formatCardIdForExport(baseCard.cardId)
  }

  // Fallback: use the card's own cardId if available
  if (card.cardId) {
    return formatCardIdForExport(card.cardId)
  }

  // Last resort: return null
  return null
}
