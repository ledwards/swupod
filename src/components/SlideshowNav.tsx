'use client'

import { useEffect, useMemo } from 'react'
import Button from './Button'
import type { SlideshowPick } from './draftSlideshowTypes'

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  const left = direction === 'left'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {left ? (
        <>
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </>
      ) : (
        <>
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </>
      )}
    </svg>
  )
}

function isTextInputActive() {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (active instanceof HTMLElement && active.isContentEditable)
}

export function getSlideLabel(pick: SlideshowPick | null | undefined): string {
  if (!pick) return 'No Public Picks'
  if (pick.packNumber === 0 || pick.type === 'leader') return `Leaders · Pick ${pick.pickInPack}`
  return `Pack ${pick.packNumber} · Pick ${pick.pickInPack}`
}

export default function SlideshowNav({
  slideIndex,
  slideCount,
  currentPick,
  onSlideChange,
}: {
  slideIndex: number
  slideCount: number
  currentPick: SlideshowPick | null
  onSlideChange: (nextIndex: number) => void
}) {
  const canGoPrevious = slideIndex > 0
  const canGoNext = slideIndex < slideCount - 1
  const label = useMemo(() => getSlideLabel(currentPick), [currentPick])

  const goPrevious = () => {
    if (canGoPrevious) onSlideChange(slideIndex - 1)
  }

  const goNext = () => {
    if (canGoNext) onSlideChange(slideIndex + 1)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputActive()) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (slideIndex > 0) onSlideChange(slideIndex - 1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (slideIndex < slideCount - 1) onSlideChange(slideIndex + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slideIndex, slideCount, onSlideChange])

  return (
    <>
      <Button
        variant="icon"
        className="draft-slideshow-edge-arrow draft-slideshow-edge-arrow--left"
        onClick={goPrevious}
        disabled={!canGoPrevious}
        aria-label="Previous pick"
        aria-disabled={!canGoPrevious}
        data-testid="slideshow-edge-prev"
      >
        <ArrowIcon direction="left" />
      </Button>

      <Button
        variant="icon"
        className="draft-slideshow-edge-arrow draft-slideshow-edge-arrow--right"
        onClick={goNext}
        disabled={!canGoNext}
        aria-label="Next pick"
        aria-disabled={!canGoNext}
        data-testid="slideshow-edge-next"
      >
        <ArrowIcon direction="right" />
      </Button>

      <div className="draft-slideshow-nav">
        <Button
          variant="secondary"
          size="sm"
          onClick={goPrevious}
          disabled={!canGoPrevious}
          aria-disabled={!canGoPrevious}
        >
          <ArrowIcon direction="left" />
          Prev
        </Button>

        <div className="draft-slideshow-nav-label" aria-live="polite" data-testid="slideshow-slide-label">
          {label}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={goNext}
          disabled={!canGoNext}
          aria-disabled={!canGoNext}
        >
          Next
          <ArrowIcon direction="right" />
        </Button>
      </div>
    </>
  )
}
