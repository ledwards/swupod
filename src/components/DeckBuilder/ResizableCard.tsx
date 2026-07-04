// @ts-nocheck
/**
 * ResizableCard Component
 *
 * A card component that scales dynamically with its container.
 * Border radius scales proportionally with card size.
 * Used in Arena view where cards resize based on available space.
 */

import { useRef, useEffect, useState, type MouseEvent, type TouchEvent, type CSSProperties } from 'react'
import type { CardData } from '../Card'
import { CardStatsBadge } from '../CardStatsBadge'

// Base card dimensions and radius ratio
// At 120px width, radius should be ~6.4px (reduced by 20% from original 8px)
const BASE_CARD_WIDTH = 120
const BASE_RADIUS = 6.4
const RADIUS_RATIO = BASE_RADIUS / BASE_CARD_WIDTH // ~0.053
// Leaders/bases are landscape and need half the ratio
const LEADER_BASE_RADIUS_RATIO = RADIUS_RATIO / 2 // ~0.027

export interface ResizableCardProps {
  card: CardData | null
  selected?: boolean
  hovered?: boolean
  active?: boolean
  inactive?: boolean
  disabled?: boolean
  filteredOut?: boolean
  showPenalty?: boolean
  penaltyAmount?: number
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void
  onTouchStart?: (e: TouchEvent<HTMLDivElement>) => void
  onTouchEnd?: (e: TouchEvent<HTMLDivElement>) => void
  className?: string
  style?: CSSProperties
  // Arena-specific: don't scale on hover
  noHoverScale?: boolean
  // Arena-specific: disable rainbow border animation
  noRainbowBorder?: boolean
  statsSetCode?: string | null
}

export function ResizableCard({
  card,
  selected = false,
  hovered = false,
  active = false,
  inactive = false,
  disabled = false,
  filteredOut = false,
  showPenalty = false,
  penaltyAmount = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
  className = '',
  style = {},
  noHoverScale = false,
  noRainbowBorder = false,
  statsSetCode = null,
}: ResizableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [borderRadius, setBorderRadius] = useState(BASE_RADIUS)
  const [cardWidth, setCardWidth] = useState(BASE_CARD_WIDTH)

  // Update border radius when card resizes
  useEffect(() => {
    if (!cardRef.current || !card) return

    const isLeaderOrBase = card.isLeader || card.isBase
    const ratio = isLeaderOrBase ? LEADER_BASE_RADIUS_RATIO : RADIUS_RATIO

    const updateRadius = () => {
      if (cardRef.current) {
        const width = cardRef.current.offsetWidth
        const newRadius = Math.round(width * ratio)
        setCardWidth(width)
        setBorderRadius(newRadius)
      }
    }

    // Initial calculation
    updateRadius()

    // Watch for resize
    const observer = new ResizeObserver(updateRadius)
    observer.observe(cardRef.current)

    return () => observer.disconnect()
  }, [card])

  if (!card) return null

  // Build class list
  const classes = [
    'resizable-card',
    card.isLeader && 'leader',
    card.isBase && 'base',
    card.isFoil && 'foil',
    card.isHyperspace && 'hyperspace',
    card.isShowcase && 'showcase',
    card.isPlaceholder && 'placeholder-card',
    selected && !noRainbowBorder && 'selected',
    hovered && 'hovered',
    active && card.isLeader && 'active-leader',
    active && card.isBase && 'active-base',
    inactive && 'inactive',
    disabled && 'disabled',
    filteredOut && 'filtered-out',
    noHoverScale && 'no-hover-scale',
    className,
  ].filter(Boolean).join(' ')

  const cardStyle: CSSProperties = {
    '--rainbow-border-reference': `${cardWidth}px`,
    borderRadius: `${borderRadius}px`,
    cursor: 'pointer',
    ...style,
  }

  const imageStyle: CSSProperties = {
    borderRadius: `${borderRadius}px`,
  }

  return (
    <div
      ref={cardRef}
      className={classes}
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-card-id={card.id}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name || 'Card'}
          className="card-image"
          style={imageStyle}
          draggable={false}
        />
      ) : (
        <div className="card-placeholder" style={imageStyle}>
          {card.isPlaceholder && <div className="card-placeholder-badge">Unknown</div>}
          <div className="card-name">{card.name || card.placeholderBucketLabel || 'Card'}</div>
          {card.isPlaceholder && (
            <div className="card-placeholder-details">{[card.type && card.type !== 'Unknown' ? card.type : null, ...(card.aspects || [])].filter(Boolean).join(' · ')}</div>
          )}
          <div className="card-rarity">{card.rarity}</div>
        </div>
      )}

      {card.imageUrl ? <CardStatsBadge card={card} setCode={statsSetCode} /> : null}

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

export default ResizableCard
