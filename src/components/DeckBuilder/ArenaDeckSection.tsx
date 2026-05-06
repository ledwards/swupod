// @ts-nocheck
/**
 * ArenaDeckSection Component
 *
 * Bottom half of the arena view. Renders deck cards by delegating to the shared
 * ArenaCardArea (same component the pool section uses), so Pool and Deck render
 * identically for the same sort option.
 */

import { useMemo, type MouseEvent } from 'react'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { ArenaCardArea } from './ArenaCardArea'
import type { CardData } from '../Card'
import type { SortOption } from './SortControls'

interface CardPosition {
  card: CardData
  section: string
  visible: boolean
  enabled?: boolean
  [key: string]: unknown
}

interface CardEntry {
  cardId: string
  position: CardPosition
}

export interface ArenaDeckSectionProps {
  onCardClick?: (cardId: string, e: MouseEvent) => void
  onCardMouseEnter?: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (cardId: string, card: CardData) => void
  onCardTouchEnd?: () => void
}

export function ArenaDeckSection({
  onCardClick,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
}: ArenaDeckSectionProps) {
  const {
    cardPositions,
    showDeckAspectPenalties,
    arenaDeckSortOption,
    deckCardDensity,
  } = useDeckBuilder()

  const deckCards = useMemo((): CardEntry[] => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) =>
        pos.section === 'deck' &&
        pos.visible &&
        !pos.card.isBase &&
        !pos.card.isLeader &&
        pos.enabled !== false
      )
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  return (
    <div className="arena-deck-section">
      <ArenaCardArea
        cards={deckCards}
        sortOption={arenaDeckSortOption as SortOption}
        density={deckCardDensity}
        showAspectPenalties={showDeckAspectPenalties}
        emptyMessage="No cards in deck."
        onCardClick={onCardClick}
        onCardMouseEnter={onCardMouseEnter}
        onCardMouseLeave={onCardMouseLeave}
        onCardTouchStart={onCardTouchStart}
        onCardTouchEnd={onCardTouchEnd}
      />
    </div>
  )
}

export default ArenaDeckSection
