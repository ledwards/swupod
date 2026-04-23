// @ts-nocheck
/**
 * ArenaCardStack Component
 *
 * Renders cards in a vertical stack within a cost column.
 * Single cards show ~12.5% of height, cards with quantity show ~25% with quantity badge.
 * Uses ResizableCard with noHoverScale to prevent hover enlargement.
 */

import type { MouseEvent } from 'react'
import { ResizableCard } from './ResizableCard'
import type { CardData } from '../Card'

interface CardPosition {
  card: CardData
  [key: string]: unknown
}

interface CardEntry {
  cardId: string
  cardIds?: string[]  // All card IDs if grouped
  position: CardPosition
  quantity?: number
}

export interface ArenaCardStackProps {
  cards: CardEntry[]
  showPenalty?: boolean
  leaderCard?: CardData | null
  baseCard?: CardData | null
  calculatePenalty?: (card: CardData) => number
  onCardClick?: (cardId: string, e: MouseEvent) => void
  onCardMouseEnter?: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (cardId: string, card: CardData) => void
  onCardTouchEnd?: () => void
  hoveredCard?: string | null
  selectedCards?: Set<string>
  density?: 'small' | 'medium' | 'large'
}

export function ArenaCardStack({
  cards,
  showPenalty = false,
  calculatePenalty,
  onCardClick,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
  hoveredCard,
  selectedCards = new Set(),
  density = 'small',
}: ArenaCardStackProps) {
  if (!cards || cards.length === 0) {
    return null
  }

  return (
    <div className={`arena-card-stack arena-card-stack--${density}`}>
      <div className="arena-card-stack-inner">
        {cards.map((entry, index) => {
          const { cardId, cardIds, position, quantity = 1 } = entry
          const card = position.card
          // Check if any of the grouped cards are selected/hovered
          const allIds = cardIds || [cardId]
          const isSelected = allIds.some(id => selectedCards.has(id))
          const isHovered = allIds.some(id => hoveredCard === id)
          const penalty = showPenalty && calculatePenalty ? calculatePenalty(card) : 0
          const hasQuantity = quantity > 1
          const isLast = index === cards.length - 1

          return (
            <div
              key={cardId}
              className={`arena-stacked-card arena-stacked-card--${density} ${hasQuantity ? 'has-quantity' : ''} ${isLast ? 'is-last' : ''}`}
            >
              <ResizableCard
                card={card}
                selected={isSelected}
                hovered={isHovered}
                showPenalty={showPenalty && penalty > 0}
                penaltyAmount={penalty}
                noHoverScale={true}
                onClick={(e) => onCardClick?.(cardId, e)}
                onMouseEnter={(e) => onCardMouseEnter?.(cardId, card, e)}
                onMouseLeave={onCardMouseLeave}
                onTouchStart={() => onCardTouchStart?.(cardId, card)}
                onTouchEnd={() => onCardTouchEnd?.()}
              />
              {hasQuantity && (
                <div className="arena-quantity-badge">
                  x{quantity}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ArenaCardStack
