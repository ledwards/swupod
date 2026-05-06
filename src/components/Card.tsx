// @ts-nocheck
/**
 * Card Component
 *
 * Reusable card component for displaying Star Wars: Unlimited cards.
 * Handles all card variants (foil, hyperspace, showcase) and states
 * (selected, disabled, stacked).
 */

import './Card.css'
import type { CSSProperties, ReactNode, MouseEvent, TouchEvent } from 'react'

export interface CardData {
  id: string
  name?: string
  imageUrl?: string
  rarity?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
}

export interface CardProps {
  card: CardData | null
  selected?: boolean
  hovered?: boolean
  active?: boolean
  disabled?: boolean
  filteredOut?: boolean
  stacked?: boolean
  stackIndex?: number
  showPenalty?: boolean
  penaltyAmount?: number
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void
  onTouchStart?: (e: TouchEvent<HTMLDivElement>) => void
  onTouchEnd?: (e: TouchEvent<HTMLDivElement>) => void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

// Helper to get rarity color for placeholder cards
const getRarityColor = (rarity?: string): string => {
  switch (rarity) {
    case 'Common': return '#999'
    case 'Uncommon': return '#4CAF50'
    case 'Rare': return '#2196F3'
    case 'Legendary': return '#FF9800'
    default: return '#666'
  }
}

export function Card({
  card,
  selected = false,
  hovered = false,
  active = false,
  disabled = false,
  filteredOut = false,
  stacked = false,
  stackIndex = 0,
  showPenalty = false,
  penaltyAmount = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className = '',
  style = {},
  children,
  ...rest
}: CardProps) {
  if (!card) return null

  // Build class list using DeckBuilder.css class names
  const classes = [
    'canvas-card',
    card.isLeader && 'leader',
    card.isBase && 'base',
    card.isFoil && 'foil',
    card.isHyperspace && 'hyperspace',
    card.isShowcase && 'showcase',
    selected && 'selected',
    hovered && 'hovered',
    active && card.isLeader && 'active-leader',
    active && card.isBase && 'active-base',
    disabled && 'disabled',
    filteredOut && 'filtered-out',
    stacked && 'stacked',
    className,
  ].filter(Boolean).join(' ')

  // Build inline style
  const cardStyle: CSSProperties = {
    cursor: 'pointer',
    position: 'relative',
    ...(stacked && stackIndex ? {
      left: `${stackIndex * 24}px`,
      zIndex: stackIndex
    } : {}),
    ...style
  }

  return (
    <div
      className={classes}
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-card-id={card.id}
      {...rest}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name || 'Card'}
          className="card-image"
          draggable={false}
        />
      ) : (
        <div className="card-placeholder">
          <div className="card-name">{card.name || 'Card'}</div>
          <div className="card-rarity" style={{ color: getRarityColor(card.rarity) }}>
            {card.rarity}
          </div>
        </div>
      )}

      {/* Badges container */}
      <div className="card-badges">
        {children}
      </div>

      {/* Aspect penalty badge */}
      {showPenalty && penaltyAmount > 0 && (
        <div className="aspect-penalty-badge">
          <div className="penalty-icon">
            <img src="/icons/cost.png" alt="Cost" />
            <span className="penalty-text">+{penaltyAmount}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Card
