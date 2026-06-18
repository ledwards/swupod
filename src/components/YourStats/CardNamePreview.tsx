// @ts-nocheck
'use client'

/**
 * CardName + a single shared card-image preview for the /me stats surfaces.
 *
 * Wrap a region in <CardPreviewProvider> once (it owns ONE useCardPreview hook
 * and renders ONE portal), then render <CardName entry={...} /> wherever a card
 * or leader name appears. The name shows its subtitle in a distinct font, and
 * hovering (or long-pressing on touch) the name pops the card image — reusing
 * the same useCardPreview + CardPreview components the deck builder uses.
 *
 * One hook for the whole region (not one per name) keeps it cheap — dozens of
 * names would otherwise each register scroll/visibility listeners.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCardPreview } from '@/src/hooks/useCardPreview'
import { CardPreview } from '@/src/components/DeckBuilder/CardPreview'

export interface CardNameEntry {
  name: string
  subtitle?: string | null
  imageUrl?: string | null
  backImageUrl?: string | null
  isLeader?: boolean
}

const Ctx = createContext(null)

export function CardPreviewProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const preview = useCardPreview()
  return (
    <Ctx.Provider value={preview}>
      {children}
      {mounted && preview.hoveredCardPreview && createPortal(
        <CardPreview
          card={preview.hoveredCardPreview.card}
          x={preview.hoveredCardPreview.x}
          y={preview.hoveredCardPreview.y}
          isMobile={preview.hoveredCardPreview.isMobile}
          onMouseEnter={preview.handlePreviewMouseEnter}
          onMouseLeave={preview.handlePreviewMouseLeave}
        />,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function CardName({ entry, className = '' }: { entry: CardNameEntry; className?: string }) {
  const preview = useContext(Ctx)
  const card = entry.imageUrl
    ? { name: entry.name, imageUrl: entry.imageUrl, backImageUrl: entry.backImageUrl || null, isLeader: !!entry.isLeader }
    : null

  const hoverProps = preview && card
    ? {
        onMouseEnter: (e: any) => preview.handleCardMouseEnter(card, e),
        onMouseLeave: () => preview.handleCardMouseLeave(),
        onTouchStart: () => preview.handleCardTouchStart(card),
        onTouchEnd: () => preview.handleCardTouchEnd(),
      }
    : {}

  return (
    <span className={`your-stats-cardname ${className}`}>
      <span className={`your-stats-cardname-name${card ? ' is-previewable' : ''}`} {...hoverProps}>
        {entry.name}
      </span>
      {entry.subtitle ? <span className="your-stats-cardname-sub">{entry.subtitle}</span> : null}
    </span>
  )
}
