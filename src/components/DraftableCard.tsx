// @ts-nocheck
'use client'

import { useState, useRef, useEffect } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { CardStatsBadge } from './CardStatsBadge'
import './DraftableCard.css'

interface CardData {
  id: string
  cardId?: string
  name: string
  imageUrl?: string
  backImageUrl?: string
  rarity?: string
  type?: string
  aspects?: string[]
  placeholderBucketLabel?: string
  isFoil?: boolean
  isLeader?: boolean
  isBase?: boolean
  variantType?: string
  isPlaceholder?: boolean
}

interface CardPreview {
  card: CardData
  x: number | null
  y: number | null
}

export interface DraftableCardProps {
  card: CardData
  onClick?: (card: CardData) => void
  onRightClick?: (e: MouseEvent, card: CardData) => void
  onHover?: (card: CardData | null) => void
  disabled?: boolean
  selected?: boolean
  dimmed?: boolean
  useStaticPreview?: boolean
  statsSetCode?: string | null
}

function DraftableCard({
  card,
  onClick,
  onRightClick,
  onHover,
  disabled = false,
  selected = false,
  dimmed = false,
  useStaticPreview = false,
  statsSetCode = null
}: DraftableCardProps) {
  const [imageError, setImageError] = useState(false)
  const [hoveredCardPreview, setHoveredCardPreview] = useState<CardPreview | null>(null)
  const [mobileZoom, setMobileZoom] = useState(false)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const getRarityClass = (rarity?: string): string => {
    switch (rarity) {
      case 'Legendary':
        return 'legendary'
      case 'Rare':
        return 'rare'
      case 'Uncommon':
        return 'uncommon'
      default:
        return 'common'
    }
  }

  const handleClick = () => {
    if (disabled) return
    // If a long-press just opened the zoom, swallow this click so the same
    // gesture doesn't also pick the card.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    onClick?.(card)
  }

  // Long-press to inspect on touch devices: press and hold (~450ms) zooms the
  // card; a quick tap still picks it. Movement (a scroll) cancels the press, so
  // you can't accidentally zoom while scrolling the pack — and the click guard
  // above means a zoom never doubles as a pick.
  const LONG_PRESS_MS = 450
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || !card.imageUrl) return
    longPressFiredRef.current = false
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      setMobileZoom(true)
    }, LONG_PRESS_MS)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (Math.abs(t.clientX - touchStartRef.current.x) > 10 ||
        Math.abs(t.clientY - touchStartRef.current.y) > 10) {
      clearLongPress()
    }
  }

  const handleTouchEnd = () => {
    clearLongPress()
  }

  // Keyboard operability: the card is the core pick affordance, so it must be
  // selectable without a mouse. Enter/Space activate it like a native button.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(card)
    }
  }

  const handleRightClick = (e: MouseEvent) => {
    e.preventDefault()
    onRightClick?.(e, card)
  }

  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    onHover?.(card)

    // Skip hover preview on small viewports (use same check as useCardPreview)
    if (window.innerWidth <= 768 || window.innerHeight <= 500) return

    const rect = e.currentTarget.getBoundingClientRect()

    // Set timeout to show preview after hovering
    previewTimeoutRef.current = setTimeout(() => {
      if (useStaticPreview) {
        // Static preview in left half of screen
        setHoveredCardPreview({ card, x: null, y: null })
      } else {
        // Calculate preview dimensions
        const isHorizontal = card.isLeader || card.isBase
        const hasBackImage = card.backImageUrl && card.isLeader
        let previewWidth: number, previewHeight: number
        if (hasBackImage) {
          previewWidth = 504 + 360 + 20
          previewHeight = 504
        } else {
          previewWidth = isHorizontal ? 504 : 360
          previewHeight = isHorizontal ? 360 : 504
        }

        // Start centered above the card
        let previewX = rect.left + (rect.width / 2) - (previewWidth / 2)
        let previewY = rect.top - previewHeight - 10

        // Clamp to viewport - NEVER go outside
        const margin = 10
        const maxX = window.innerWidth - previewWidth - margin
        const maxY = window.innerHeight - previewHeight - margin

        if (previewX < margin) previewX = margin
        if (previewX > maxX) previewX = Math.max(margin, maxX)
        if (previewY < margin) previewY = margin
        if (previewY > maxY) previewY = Math.max(margin, maxY)

        setHoveredCardPreview({ card, x: previewX, y: previewY })
      }
    }, 400)
  }

  const handleMouseLeave = () => {
    onHover?.(null)

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
      previewTimeoutRef.current = null
    }
    setHoveredCardPreview(null)
  }

  const placeholderTitle = card.name || card.placeholderBucketLabel || 'Unknown ASH card'
  const placeholderType = card.type && card.type !== 'Unknown' ? card.type : null
  const placeholderDetails = [placeholderType, ...(card.aspects || [])].filter(Boolean).join(' · ')

  return (
    <>
      <div
        className={`draftable-card ${disabled ? 'disabled' : ''} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${card.isFoil ? 'foil' : ''} ${card.variantType === 'Hyperspace' ? 'hyperspace' : ''} ${card.isLeader ? 'leader' : ''} ${card.isBase ? 'base' : ''} ${card.isPlaceholder ? 'placeholder-card' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleRightClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={selected}
        aria-disabled={disabled || undefined}
        aria-label={card.name}
      >
        {/* Card image. Selection is shown via the green glow on .selected (CSS),
            matching the holotable system — not the old always-on rainbow border
            (reserved for showcase emphasis only, per DESIGN.md). */}
        <div
          className={card.isFoil ? 'foil-content' : ''}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 0,
            overflow: 'hidden',
          }}>
          {card.imageUrl && !imageError ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              onError={() => setImageError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div className="card-placeholder">
              {card.isPlaceholder && <div className="placeholder-badge">Unknown</div>}
              <div className="placeholder-name">{placeholderTitle}</div>
              {card.isPlaceholder && <div className="placeholder-details">{placeholderDetails}</div>}
              <div className="placeholder-rarity">{card.rarity}</div>
            </div>
          )}
          {card.imageUrl && !imageError ? <CardStatsBadge card={card} setCode={statsSetCode} /> : null}
        </div>
      </div>

      {mounted && mobileZoom && card.imageUrl && createPortal(
        <div
          className="draftable-card-zoom-overlay"
          onClick={() => setMobileZoom(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${card.name || 'Card'} enlarged`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <img
            src={card.imageUrl}
            alt={card.name}
            style={{
              maxWidth: '92vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            }}
          />
        </div>,
        document.body
      )}

      {mounted && hoveredCardPreview && createPortal(
        (() => {
          const previewCard = hoveredCardPreview.card
          const hasBackImage = previewCard.backImageUrl && previewCard.isLeader
          const isHorizontal = previewCard.isLeader || previewCard.isBase
          const borderRadius = '12px'

          let previewWidth: number, previewHeight: number
          if (hasBackImage) {
            previewWidth = 504 + 360 + 20
            previewHeight = 504
          } else {
            previewWidth = isHorizontal ? 504 : 360
            previewHeight = isHorizontal ? 360 : 504
          }

          // Static preview positioning (left half of screen)
          const staticStyle = useStaticPreview ? {
            position: 'fixed' as const,
            left: '0',
            top: '0',
            width: '50vw',
            height: '100vh',
            zIndex: 9999,
            pointerEvents: 'none' as const,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          } : {
            position: 'fixed' as const,
            left: `${hoveredCardPreview.x}px`,
            top: `${hoveredCardPreview.y}px`,
            zIndex: 9999,
            pointerEvents: 'none' as const,
            width: `${previewWidth}px`,
            height: `${previewHeight}px`,
          }

          // Calculate scaled dimensions for static preview
          let scaledFrontWidth = 0, scaledFrontHeight = 0, scaledBackWidth = 0, scaledBackHeight = 0
          if (useStaticPreview && hasBackImage) {
            // Scale down to fit both images in left half
            // Target: fit within ~45vw width and ~90vh height
            const scale = 0.6 // Scale down to 60% of original size
            scaledFrontWidth = 504 * scale
            scaledFrontHeight = 360 * scale
            scaledBackWidth = 360 * scale
            scaledBackHeight = 504 * scale
          } else if (useStaticPreview) {
            // Single image - use more space
            const scale = isHorizontal ? 1.5 : 1.2
            scaledFrontWidth = previewWidth * scale
            scaledFrontHeight = previewHeight * scale
          }

          return (
            <div
              className="card-preview-enlarged"
              style={{
                ...staticStyle,
                overflow: 'visible',
              }}
            >
              {hasBackImage ? (
                <div style={{ display: 'flex', gap: useStaticPreview ? '15px' : '20px', alignItems: 'center' }}>
                  {/* Front - horizontal */}
                  <div className={previewCard.isFoil ? 'card-preview-foil' : ''} style={{
                    width: useStaticPreview ? `${scaledFrontWidth}px` : '504px',
                    height: useStaticPreview ? `${scaledFrontHeight}px` : '360px',
                    overflow: 'hidden',
                    borderRadius: borderRadius,
                    boxShadow: previewCard.isFoil ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    position: 'relative',
                    flexShrink: 0,
                  }}>
                    <img
                      src={previewCard.imageUrl}
                      alt={previewCard.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                  {/* Back - vertical */}
                  <div className={previewCard.isFoil ? 'card-preview-foil' : ''} style={{
                    width: useStaticPreview ? `${scaledBackWidth}px` : '360px',
                    height: useStaticPreview ? `${scaledBackHeight}px` : '504px',
                    overflow: 'hidden',
                    borderRadius: borderRadius,
                    boxShadow: previewCard.isFoil ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    position: 'relative',
                    flexShrink: 0,
                  }}>
                    <img
                      src={previewCard.backImageUrl}
                      alt={`${previewCard.name} (back)`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className={previewCard.isFoil ? 'card-preview-foil' : ''} style={{
                  width: useStaticPreview ? `${scaledFrontWidth}px` : `${previewWidth}px`,
                  height: useStaticPreview ? `${scaledFrontHeight}px` : `${previewHeight}px`,
                  overflow: 'hidden',
                  borderRadius: useStaticPreview ? '24px' : borderRadius,
                  boxShadow: previewCard.isFoil ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  position: 'relative',
                }}>
                  <img
                    src={previewCard.imageUrl}
                    alt={previewCard.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })(),
        document.body
      )}
    </>
  )
}

export default DraftableCard
