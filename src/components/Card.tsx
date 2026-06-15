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
import { AspectIcon } from './AspectIcon'

export interface CardData {
  id: string
  cardId?: string
  name?: string
  imageUrl?: string
  rarity?: string
  type?: string
  aspects?: string[]
  placeholderBucketLabel?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
  isPlaceholder?: boolean
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
  /** When true, render placeholder aspect names as icons instead of words. */
  aspectsAsIcons?: boolean
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void
  onTouchStart?: (e: TouchEvent<HTMLDivElement>) => void
  onTouchEnd?: (e: TouchEvent<HTMLDivElement>) => void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

function placeholderTitle(card: CardData): string {
  return card.name || card.placeholderBucketLabel || 'Unknown ASH card'
}

function placeholderDetails(card: CardData): string {
  const type = card.type && card.type !== 'Unknown' ? card.type : null
  const details = [type, ...(card.aspects || [])].filter(Boolean)
  return details.join(' · ')
}

// Same shape as `placeholderDetails` but renders aspect names as icons.
// Used when the caller opts in via the `aspectsAsIcons` prop — keeps the type
// word ("Leader", "Base") and replaces just the aspect text with icons.
function placeholderDetailsWithIcons(card: CardData): ReactNode {
  const type = card.type && card.type !== 'Unknown' ? card.type : null
  const aspects = card.aspects || []

  if (!type && aspects.length === 0) return null

  return (
    <>
      {type && <span>{type}</span>}
      {type && aspects.length > 0 && <span aria-hidden="true">{' · '}</span>}
      {aspects.length > 0 && (
        <span className="card-placeholder-aspect-icons">
          {aspects.map((aspect, i) => (
            <AspectIcon key={`${aspect}-${i}`} aspect={aspect} size="xs" />
          ))}
        </span>
      )}
    </>
  )
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
  aspectsAsIcons = false,
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
    card.isPlaceholder && 'placeholder-card',
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

  // Keyboard operability: when the card is a real control (has an onClick),
  // expose it as a button so keyboard/AT users can select it. Enter/Space
  // activate it, matching native button behavior.
  const interactive = typeof onClick === 'function' && !disabled
  const handleKeyDown = interactive
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e)
        }
      }
    : undefined

  return (
    <div
      className={classes}
      style={cardStyle}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-disabled={disabled || undefined}
      aria-label={interactive ? (card.name || 'Card') : undefined}
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
          {card.isPlaceholder && <div className="card-placeholder-badge">Unknown</div>}
          <div className="card-name">{placeholderTitle(card)}</div>
          {card.isPlaceholder && (
            <div className="card-placeholder-details">
              {aspectsAsIcons ? placeholderDetailsWithIcons(card) : placeholderDetails(card)}
            </div>
          )}
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
