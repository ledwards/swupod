// @ts-nocheck
/**
 * CardPreview Component
 *
 * Renders an enlarged preview of a card on hover.
 * Shows both front and back for leaders with back images.
 */

export interface PreviewCard {
  cardId?: string
  name?: string
  imageUrl?: string
  backImageUrl?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isShowcase?: boolean
  rarity?: string
  type?: string
  aspects?: string[]
  placeholderBucketLabel?: string
  isPlaceholder?: boolean
}

export interface CardPreviewProps {
  card: PreviewCard | null
  x: number
  y: number
  isMobile?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onDismiss?: () => void
}

function placeholderTitle(card: PreviewCard): string {
  return card.name || card.placeholderBucketLabel || 'Unknown ASH card'
}

function placeholderDetails(card: PreviewCard): string {
  const type = card.type && card.type !== 'Unknown' ? card.type : null
  return [type, ...(card.aspects || [])].filter(Boolean).join(' · ')
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

export function CardPreview({
  card,
  x,
  y,
  isMobile = false,
  onMouseEnter,
  onMouseLeave,
  onDismiss,
}: CardPreviewProps) {
  if (!card) return null

  const hasBackImage = card.backImageUrl && card.isLeader
  const isHorizontal = card.isLeader || card.isBase
  const borderRadius = '12px'

  // Calculate dimensions
  // Leaders and bases are landscape: 168px x 120px, so 3x = 504px x 360px
  // Regular cards are portrait: 120px x 168px, so 3x = 360px x 504px
  let previewWidth: number, previewHeight: number
  if (hasBackImage) {
    // Leader with back: side by side (horizontal front + vertical back)
    previewWidth = 504 + 360 + 20 // 504px front + 360px back + 20px gap
    previewHeight = 504 // Max height (vertical back is 504px)
  } else {
    previewWidth = isHorizontal ? 504 : 360
    previewHeight = isHorizontal ? 360 : 504
  }

  const isFoilOrShowcase = (card.isFoil && !card.isLeader) || card.isShowcase

  // Mobile: fullscreen overlay with card scaled to fit viewport
  if (isMobile) {
    const vpW = typeof window !== 'undefined' ? window.innerWidth : 400
    const vpH = typeof window !== 'undefined' ? window.innerHeight : 700
    const padding = 20
    const availW = vpW - padding * 2
    const availH = vpH - padding * 2
    // For mobile, don't show back image side-by-side — just show front
    const mobileW = isHorizontal ? 504 : 360
    const mobileH = isHorizontal ? 360 : 504
    const scale = Math.min(availW / mobileW, availH / mobileH, 1)
    const finalW = mobileW * scale
    const finalH = mobileH * scale

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onDismiss}
        onTouchEnd={onDismiss}
      >
        <div
          style={{
            width: `${finalW}px`,
            height: `${finalH}px`,
            borderRadius: borderRadius,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name || 'Card'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'rgba(26, 26, 46, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '1rem',
              color: 'white',
            }}>
              {card.isPlaceholder && <div style={{ fontSize: '0.8rem', letterSpacing: 0, textTransform: 'uppercase', color: '#f7c873', marginBottom: '0.5rem' }}>Unknown</div>}
              <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                {placeholderTitle(card)}
              </div>
              {card.isPlaceholder && <div style={{ fontSize: '0.95rem', color: '#d7d7d7', marginBottom: '0.5rem' }}>{placeholderDetails(card)}</div>}
              <div style={{ color: getRarityColor(card.rarity) }}>
                {card.rarity}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Desktop: positioned preview
  return (
    <div
      className="card-preview-enlarged"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        zIndex: 9999,
        pointerEvents: 'none',
        transform: 'translateY(-50%)',
        width: `${previewWidth}px`,
        height: `${previewHeight}px`,
        borderRadius: borderRadius,
        overflow: 'visible',
        // Only apply shadow to container when NOT showing side-by-side (each inner card has its own shadow)
        boxShadow: hasBackImage ? 'none' : '0 8px 32px rgba(0, 0, 0, 0.8)',
        border: 'none',
        display: 'flex',
        flexDirection: 'row',
        gap: '20px',
        // Align items to top so front card doesn't center vertically in taller container
        alignItems: hasBackImage ? 'flex-start' : 'stretch',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasBackImage ? (
        // Show both front (horizontal) and back (vertical) side by side for leaders
        <>
          {/* Front - horizontal */}
          <div
            className={isFoilOrShowcase ? 'card-preview-foil' : ''}
            style={{
              width: '504px',
              height: '360px',
              overflow: 'hidden',
              borderRadius: borderRadius,
              boxShadow: isFoilOrShowcase ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              position: 'relative',
            }}
          >
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={`${card.name || 'Card'} - Front`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                background: 'rgba(26, 26, 46, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1rem',
                color: 'white',
              }}>
                {card.isPlaceholder && <div style={{ fontSize: '0.8rem', letterSpacing: 0, textTransform: 'uppercase', color: '#f7c873', marginBottom: '0.5rem' }}>Unknown</div>}
                <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                  {placeholderTitle(card)} - Front
                </div>
                {card.isPlaceholder && <div style={{ fontSize: '0.95rem', color: '#d7d7d7', marginBottom: '0.5rem' }}>{placeholderDetails(card)}</div>}
                <div style={{ color: getRarityColor(card.rarity) }}>
                  {card.rarity}
                </div>
              </div>
            )}
          </div>
          {/* Back - vertical */}
          <div
            className={isFoilOrShowcase ? 'card-preview-foil' : ''}
            style={{
              width: '360px',
              height: '504px',
              overflow: 'hidden',
              borderRadius: borderRadius,
              boxShadow: isFoilOrShowcase ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              position: 'relative',
            }}
          >
            {card.backImageUrl ? (
              <img
                src={card.backImageUrl}
                alt={`${card.name || 'Card'} - Back`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                background: 'rgba(26, 26, 46, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1rem',
                color: 'white',
              }}>
                {card.isPlaceholder && <div style={{ fontSize: '0.8rem', letterSpacing: 0, textTransform: 'uppercase', color: '#f7c873', marginBottom: '0.5rem' }}>Unknown</div>}
                <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                  {placeholderTitle(card)} - Back
                </div>
                {card.isPlaceholder && <div style={{ fontSize: '0.95rem', color: '#d7d7d7', marginBottom: '0.5rem' }}>{placeholderDetails(card)}</div>}
                <div style={{ color: getRarityColor(card.rarity) }}>
                  {card.rarity}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        // Single card (non-leader, base, or leader without back)
        <div
          className={isFoilOrShowcase ? 'card-preview-foil' : ''}
          style={{
            width: `${previewWidth}px`,
            height: `${previewHeight}px`,
            overflow: 'hidden',
            borderRadius: borderRadius,
            boxShadow: isFoilOrShowcase ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            position: 'relative',
          }}
        >
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name || 'Card'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'rgba(26, 26, 46, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '1rem',
              color: 'white',
            }}>
              {card.isPlaceholder && <div style={{ fontSize: '0.8rem', letterSpacing: 0, textTransform: 'uppercase', color: '#f7c873', marginBottom: '0.5rem' }}>Unknown</div>}
              <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                {placeholderTitle(card)}
              </div>
              {card.isPlaceholder && <div style={{ fontSize: '0.95rem', color: '#d7d7d7', marginBottom: '0.5rem' }}>{placeholderDetails(card)}</div>}
              <div style={{ color: getRarityColor(card.rarity) }}>
                {card.rarity}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CardPreview
