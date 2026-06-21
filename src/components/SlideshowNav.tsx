'use client'

/**
 * SlideshowNav — bottom navigation for Slideshow Mode (Unit U7; R9, R10).
 *
 * Three navigation affordances that all advance the SAME single slide index
 * (one source of truth → on-screen + keyboard parity):
 *   1. Bottom-center "Pack X · Pick Y" label (an aria-live region so slide
 *      changes are announced) flanked by Prev / Next {@link Button}s.
 *   2. Large full-height clickable arrow strips pinned to the LEFT / RIGHT
 *      viewport edges (`position: fixed`) — these sit at the overlay edges even
 *      though this component renders in the bottom band (expected).
 *   3. A `window` `keydown` listener: ArrowLeft → onPrev, ArrowRight → onNext.
 *
 * Hard-stops at the ends (no wrap): at the first slide Prev (button + left edge
 * arrow + ArrowLeft) is a disabled no-op; at the last slide Next is disabled.
 *
 * Mirrors the keydown pattern in DraftReviewModal.tsx / PackDraftPhase.tsx
 * (window listener added on mount, removed on unmount). Escape is owned by the
 * shell (DraftSlideshow), NOT here.
 */

import { useEffect } from 'react'
import './SlideshowNav.css'
import Button from './Button'
import type { SlideshowNavProps } from './DraftSlideshow'

/** True when focus is in a typeable field — arrow keys should not navigate then. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toUpperCase()
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  )
}

export function SlideshowNav({ slideIndex, slideCount, label, onPrev, onNext }: SlideshowNavProps) {
  const atStart = slideIndex <= 0
  const atEnd = slideCount <= 0 || slideIndex >= slideCount - 1

  // Keyboard Left/Right → the SAME onPrev/onNext the on-screen controls call.
  // Single source of truth keeps keyboard and click navigation in parity.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Escape is the shell's job — never touch it here.
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      // Defensive: don't hijack arrows while the user is in a typeable field.
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      if (e.key === 'ArrowLeft') {
        if (!atStart) onPrev()
      } else if (!atEnd) {
        onNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [atStart, atEnd, onPrev, onNext])

  // On-screen edge arrows: real <button>s so they're keyboard/AT reachable and
  // get native disabled semantics. No-op clicks at the ends (defensive — they're
  // disabled anyway). They share onPrev/onNext with the keyboard handler.
  const handlePrevClick = () => {
    if (!atStart) onPrev()
  }
  const handleNextClick = () => {
    if (!atEnd) onNext()
  }

  return (
    <>
      {/* Full-height edge arrow strips, fixed to the viewport edges. */}
      <button
        type="button"
        className="slideshow-edge slideshow-edge--prev"
        onClick={handlePrevClick}
        disabled={atStart}
        aria-disabled={atStart}
        aria-label="Previous pick"
      >
        <span className="slideshow-edge-glyph" aria-hidden="true">
          ‹
        </span>
      </button>

      {/* Bottom bar: Prev — label — Next, inside the shell's reserved nav band. */}
      <div className="slideshow-nav">
        <Button
          variant="secondary"
          onClick={handlePrevClick}
          disabled={atStart}
          aria-disabled={atStart}
          aria-label="Previous pick"
          className="slideshow-nav-btn"
        >
          <span className="slideshow-nav-btn-glyph" aria-hidden="true">
            ‹
          </span>
          Prev
        </Button>

        <div className="slideshow-nav-label" aria-live="polite">
          {label}
        </div>

        <Button
          variant="secondary"
          onClick={handleNextClick}
          disabled={atEnd}
          aria-disabled={atEnd}
          aria-label="Next pick"
          className="slideshow-nav-btn"
        >
          Next
          <span className="slideshow-nav-btn-glyph" aria-hidden="true">
            ›
          </span>
        </Button>
      </div>

      <button
        type="button"
        className="slideshow-edge slideshow-edge--next"
        onClick={handleNextClick}
        disabled={atEnd}
        aria-disabled={atEnd}
        aria-label="Next pick"
      >
        <span className="slideshow-edge-glyph" aria-hidden="true">
          ›
        </span>
      </button>
    </>
  )
}

export default SlideshowNav
