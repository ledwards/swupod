'use client'

import { useCallback, useEffect, useMemo } from 'react'
import Button from './Button'
import type { SlideshowPick, SlideshowSeat } from './draftSlideshowTypes'

type BoundaryPlayer = Pick<SlideshowSeat, 'seatNumber' | 'username'>

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
  previousPlayer,
  nextPlayer,
  onPlayerBoundaryChange,
}: {
  slideIndex: number
  slideCount: number
  currentPick: SlideshowPick | null
  onSlideChange: (nextIndex: number) => void
  previousPlayer?: BoundaryPlayer | null
  nextPlayer?: BoundaryPlayer | null
  onPlayerBoundaryChange?: (seatNumber: number, nextSlideIndex: number) => void
}) {
  const isFirstSlide = slideIndex <= 0
  const isLastSlide = slideIndex >= slideCount - 1
  const showPreviousPlayerJump = Boolean(previousPlayer && isFirstSlide && slideCount > 0)
  const showNextPlayerJump = Boolean(nextPlayer && isLastSlide && slideCount > 0)
  const canGoPrevious = slideIndex > 0 || showPreviousPlayerJump
  const canGoNext = slideIndex < slideCount - 1 || showNextPlayerJump
  const label = useMemo(() => getSlideLabel(currentPick), [currentPick])

  const goPrevious = useCallback(() => {
    if (slideIndex > 0) {
      onSlideChange(slideIndex - 1)
      return
    }

    if (previousPlayer && showPreviousPlayerJump) {
      onPlayerBoundaryChange?.(previousPlayer.seatNumber, Math.max(0, slideCount - 1))
    }
  }, [onPlayerBoundaryChange, onSlideChange, previousPlayer, showPreviousPlayerJump, slideCount, slideIndex])

  const goNext = useCallback(() => {
    if (slideIndex < slideCount - 1) {
      onSlideChange(slideIndex + 1)
      return
    }

    if (nextPlayer && showNextPlayerJump) {
      onPlayerBoundaryChange?.(nextPlayer.seatNumber, 0)
    }
  }, [nextPlayer, onPlayerBoundaryChange, onSlideChange, showNextPlayerJump, slideCount, slideIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputActive()) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrevious()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrevious, goNext])

  return (
    <>
      <Button
        variant="icon"
        className="draft-slideshow-edge-arrow draft-slideshow-edge-arrow--left"
        onClick={goPrevious}
        disabled={!canGoPrevious}
        aria-label={showPreviousPlayerJump && previousPlayer ? `Previous player: ${previousPlayer.username}` : 'Previous pick'}
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
        aria-label={showNextPlayerJump && nextPlayer ? `Next player: ${nextPlayer.username}` : 'Next pick'}
        aria-disabled={!canGoNext}
        data-testid="slideshow-edge-next"
      >
        <ArrowIcon direction="right" />
      </Button>

      {showPreviousPlayerJump && previousPlayer && (
        <Button
          variant="secondary"
          size="sm"
          className="draft-slideshow-player-jump draft-slideshow-player-jump--prev"
          onClick={goPrevious}
          aria-label={`Previous player: ${previousPlayer.username}`}
          data-testid="slideshow-prev-player"
        >
          <ArrowIcon direction="left" />
          <span className="draft-slideshow-player-jump-copy">
            <span className="draft-slideshow-player-jump-kicker">Previous player</span>
            <span className="draft-slideshow-player-jump-name">{previousPlayer.username}</span>
          </span>
        </Button>
      )}

      {showNextPlayerJump && nextPlayer && (
        <Button
          variant="secondary"
          size="sm"
          className="draft-slideshow-player-jump draft-slideshow-player-jump--next"
          onClick={goNext}
          aria-label={`Next player: ${nextPlayer.username}`}
          data-testid="slideshow-next-player"
        >
          <span className="draft-slideshow-player-jump-copy">
            <span className="draft-slideshow-player-jump-kicker">Next player</span>
            <span className="draft-slideshow-player-jump-name">{nextPlayer.username}</span>
          </span>
          <ArrowIcon direction="right" />
        </Button>
      )}

      <div className="draft-slideshow-nav">
        <div className="draft-slideshow-nav-side draft-slideshow-nav-side--prev">
          {!showPreviousPlayerJump && (
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
          )}
        </div>

        <div className="draft-slideshow-nav-label" aria-live="polite" data-testid="slideshow-slide-label">
          {label}
        </div>

        <div className="draft-slideshow-nav-side draft-slideshow-nav-side--next">
          {!showNextPlayerJump && (
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
          )}
        </div>
      </div>
    </>
  )
}
