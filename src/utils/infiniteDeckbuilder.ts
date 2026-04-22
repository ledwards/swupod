// @ts-nocheck
/**
 * Helpers for Limited Deckbuilder's infinite pool.
 *
 * The goal is to expose one gameplay representative for each non-leader/non-base
 * card, plus all leaders and rare bases, while leaving common bases to the
 * existing DeckBuilder common-base injection flow.
 */

import { buildBaseCardMap, getBaseCardId } from './variantDowngrade'
import type { RawCard } from './cardData'

function isNormalGameplayPrint(card: RawCard): boolean {
  return !card.variantType || card.variantType === 'Normal'
}

function isLeaderCard(card: RawCard): boolean {
  return card.isLeader || card.type === 'Leader'
}

function isBaseCard(card: RawCard): boolean {
  return card.isBase || card.type === 'Base'
}

function buildRepresentativeKey(card: RawCard, baseCardMap: Map<string, RawCard>): string {
  return (
    getBaseCardId(card, baseCardMap) ||
    `${card.type || 'Unknown'}|${card.name || 'Unknown'}|${card.subtitle || ''}`
  )
}

function dedupeCards(cards: RawCard[], baseCardMap: Map<string, RawCard>): RawCard[] {
  const seen = new Set<string>()

  return cards.filter((card) => {
    const key = buildRepresentativeKey(card, baseCardMap)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildInfiniteDeckbuilderPool(setCode: string, allSetCards: RawCard[]): RawCard[] {
  const baseCardMap = buildBaseCardMap(setCode)

  const gameplayCards = dedupeCards(
    allSetCards.filter((card) => !isLeaderCard(card) && !isBaseCard(card) && isNormalGameplayPrint(card)),
    baseCardMap
  )

  const leaders = dedupeCards(
    allSetCards.filter((card) => isLeaderCard(card) && isNormalGameplayPrint(card)),
    baseCardMap
  )

  const rareBases = dedupeCards(
    allSetCards.filter((card) => isBaseCard(card) && card.rarity === 'Rare' && isNormalGameplayPrint(card)),
    baseCardMap
  )

  return [...leaders, ...rareBases, ...gameplayCards]
}
