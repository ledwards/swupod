// @ts-nocheck
/**
 * Runtime Card Fixes
 * Applies corrections to card data at runtime
 *
 * This module imports fixes from scripts/cardFixes.js and applies them
 * when card data is loaded, ensuring all code uses corrected data.
 */

import { cardFixes, batchFixes, customTransforms } from '../../scripts/cardFixes'
import type { RawCard } from './cardData'

interface CardFix {
  id: string
  field: string
  value: unknown
}

interface BatchFix {
  field: string
  condition: (card: RawCard) => boolean
  value: unknown
}

interface CustomTransform {
  isArrayTransform?: boolean
  transform: (cardOrCards: RawCard | RawCard[]) => RawCard | RawCard[]
}

interface CardData {
  cards: RawCard[]
  metadata?: Record<string, unknown>
}

interface FixStats {
  individualFixes: number
  batchFixes: number
  customTransforms: number
  total: number
}

/**
 * Apply individual card fixes
 * @param cards - Array of card objects
 * @returns Number of fixes applied
 */
function applyIndividualFixes(cards: RawCard[]): number {
  let fixCount = 0

  ;(cardFixes as CardFix[]).forEach(fix => {
    const card = cards.find(c => c.id === fix.id)
    if (card) {
      (card as unknown as Record<string, unknown>)[fix.field] = fix.value
      fixCount++
    }
  })

  return fixCount
}

/**
 * Apply batch fixes based on conditions
 * @param cards - Array of card objects
 * @returns Number of fixes applied
 */
function applyBatchFixes(cards: RawCard[]): number {
  let fixCount = 0

  ;(batchFixes as BatchFix[]).forEach(batchFix => {
    cards.forEach(card => {
      if (batchFix.condition(card)) {
        (card as unknown as Record<string, unknown>)[batchFix.field] = batchFix.value
        fixCount++
      }
    })
  })

  return fixCount
}

/**
 * Apply custom transformation functions
 * @param cards - Array of card objects
 * @returns Number of cards transformed
 */
function applyCustomTransforms(cards: RawCard[]): number {
  let transformCount = 0
  let currentCards = cards

  ;(customTransforms as CustomTransform[]).forEach(transform => {
    // Check if this is an array-level transform
    if (transform.isArrayTransform) {
      const originalLength = currentCards.length
      currentCards = transform.transform(currentCards) as RawCard[]
      const newLength = currentCards.length

      // Count how many cards were filtered out
      if (newLength !== originalLength) {
        transformCount += originalLength - newLength
      }
    } else {
      // Per-card transform
      currentCards.forEach((card, index) => {
        const original = JSON.stringify(card)
        const transformed = transform.transform(card) as RawCard
        const modified = JSON.stringify(transformed)

        if (original !== modified) {
          currentCards[index] = transformed
          transformCount++
        }
      })
    }
  })

  // Replace cards array contents with transformed cards
  cards.length = 0
  cards.push(...currentCards)

  return transformCount
}

/**
 * Apply all fixes to card data
 * This is the main entry point called by cardData.js
 *
 * @param cardData - Raw card data from JSON { cards: [], metadata: {} }
 * @returns Fixed card data with same structure
 */
export function applyCardFixes(cardData: CardData | RawCard[]): CardData {
  // Handle both formats: { cards: [...] } or just [...]
  const rawCards = Array.isArray(cardData) ? cardData : (cardData.cards || [])
  const metadata = Array.isArray(cardData) ? {} : (cardData.metadata || {})

  // Clone the data to avoid mutations of the imported module
  const cards: RawCard[] = JSON.parse(JSON.stringify(rawCards))

  if (cards.length === 0) {
    return { cards, metadata }
  }

  // Track total fixes
  let totalFixes = 0

  // Apply individual fixes
  const individualFixCount = applyIndividualFixes(cards)
  totalFixes += individualFixCount

  // Apply batch fixes
  const batchFixCount = applyBatchFixes(cards)
  totalFixes += batchFixCount

  // Apply custom transforms
  applyCustomTransforms(cards)

  return {
    cards,
    metadata: {
      ...metadata,
      fixesAppliedAtRuntime: totalFixes,
      processedAt: new Date().toISOString(),
    }
  }
}

/**
 * Get statistics about available fixes (useful for debugging)
 * @returns Stats about configured fixes
 */
export function getFixStats(): FixStats {
  return {
    individualFixes: (cardFixes as CardFix[]).length,
    batchFixes: (batchFixes as BatchFix[]).length,
    customTransforms: (customTransforms as CustomTransform[]).length,
    total: (cardFixes as CardFix[]).length + (batchFixes as BatchFix[]).length + (customTransforms as CustomTransform[]).length,
  }
}
