'use client'
import { useEffect } from 'react'
import Button from '../Button'

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el?.tagName && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName.toUpperCase()) || el.isContentEditable)
}

/** Previous / next pick, the pick label and the slide count. Left and right arrow keys step too. */
export default function ReviewNav({ slideIndex, slideCount, label, onPrev, onNext }: {
  slideIndex: number; slideCount: number; label: string; onPrev: () => void; onNext: () => void
}) {
  const atStart = slideIndex <= 0
  const atEnd = slideCount <= 0 || slideIndex >= slideCount - 1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || isTyping(e.target)) return
      e.preventDefault()
      if (e.key === 'ArrowLeft') { if (!atStart) onPrev() } else if (!atEnd) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [atStart, atEnd, onPrev, onNext])

  return (
    <nav className="drv-nav" aria-label="Picks">
      <Button variant="icon" size="lg" aria-label="Previous pick" disabled={atStart} onClick={onPrev}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
      </Button>
      <div className="drv-nav-label" aria-live="polite">
        <b>{label}</b>
        {slideCount > 0 && <span>Slide {slideIndex + 1} of {slideCount}</span>}
      </div>
      <Button variant="icon" size="lg" aria-label="Next pick" disabled={atEnd} onClick={onNext}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </Button>
    </nav>
  )
}
