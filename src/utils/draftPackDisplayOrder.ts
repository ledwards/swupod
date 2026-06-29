// @ts-nocheck

interface DraftPackDisplayCard {
  rarity?: string
  isFoil?: boolean
  [key: string]: unknown
}

const SLOT_ORDER_SETS = new Set(['ASH'])

function normalizeSetCode(setCode?: string | null): string {
  return String(setCode || '').replace(/-CB$/, '').toUpperCase()
}

export function shouldPreserveDraftPackSlotOrder(setCode?: string | null): boolean {
  return SLOT_ORDER_SETS.has(normalizeSetCode(setCode))
}

export function getDraftPackDisplayOrder(
  cards: DraftPackDisplayCard[],
  setCode?: string | null
): DraftPackDisplayCard[] {
  if (shouldPreserveDraftPackSlotOrder(setCode)) {
    return getSlotOrderedPack(cards)
  }

  const sorted = [...cards]
  const rarityOrder: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 }

  return sorted.sort((a, b) => {
    if (a.isFoil && !b.isFoil) return 1
    if (!a.isFoil && b.isFoil) return -1

    return (rarityOrder[a.rarity || ''] ?? 4) - (rarityOrder[b.rarity || ''] ?? 4)
  })
}

function getSlotOrderedPack(cards: DraftPackDisplayCard[]): DraftPackDisplayCard[] {
  const foilIndex = cards.findIndex(card => card.isFoil === true)

  if (foilIndex < 0) {
    return cards
  }

  const foilCard = cards[foilIndex]
  const nonFoils = cards.filter((_, index) => index !== foilIndex)
  const insertionIndex = nonFoils.findIndex(card => card.rarity !== 'Common')
  const safeInsertionIndex = insertionIndex < 0 ? nonFoils.length : insertionIndex
  const ordered = [
    ...nonFoils.slice(0, safeInsertionIndex),
    foilCard,
    ...nonFoils.slice(safeInsertionIndex),
  ]

  return ordered.every((card, index) => card === cards[index]) ? cards : ordered
}
