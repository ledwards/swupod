'use client'

/**
 * DraftSlideshow — the full-viewport Slideshow Mode overlay shell (Unit U4).
 *
 * Owns the slideshow's state, data, keyboard/Escape handling, immersive
 * background, focus management, and the reserved layout chrome (a fixed-height
 * tab bar on top and nav bar on the bottom, with a stable stage band between).
 *
 * This file OWNS THE CONTRACT for the sibling units:
 *   - U5 SlideshowPlayerTabs implements {@link SlideshowPlayerTabsProps}
 *   - U6 SlideshowStage         implements {@link SlideshowStageProps}
 *   - U7 SlideshowNav           implements {@link SlideshowNavProps}
 * Those interfaces are exported below and MUST NOT change shape.
 *
 * No `overflow` anywhere — no-scroll is the whole point of the feature.
 * Modeled on Modal.tsx (scroll-lock + focus restore) and DraftReviewModal.tsx
 * (Escape handler), MINUS their `overflow` and MINUS Modal's full focus trap
 * over the stage (up to ~112 cards would be a keyboard trap — the focus loop is
 * constrained to the tabs + nav; stage cards are tabIndex=-1 in U6).
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import './DraftSlideshow.css'
import Button from './Button'
import SlideshowPlayerTabs from './SlideshowPlayerTabs'
import SlideshowStage from './SlideshowStage'
import SlideshowNav from './SlideshowNav'
import { getPackArtUrl } from '../utils/packArt'
import type {
  SlideshowResponse,
  SlideshowSeat,
} from '@/app/api/draft/[shareId]/report/slideshow/route'

// Re-export the U1 response shapes so siblings have a single import site.
export type { SlideshowResponse, SlideshowSeat, ChosenBase } from '@/app/api/draft/[shareId]/report/slideshow/route'

// ---------------------------------------------------------------------------
// Prescribed child prop interfaces (the contract — do NOT change their shape).
// ---------------------------------------------------------------------------

export interface SlideshowPlayerTabsProps {
  /** ALL seats (locked + unlocked), in seat order. */
  seats: SlideshowSeat[]
  /** Currently selected seat numbers. */
  selectedSeats: Set<number>
  /** Toggle a single seat in/out of the selection. */
  onToggleSeat: (seatNumber: number) => void
  /** Select every unlocked seat. */
  onSelectAll: () => void
  /** True iff every UNLOCKED seat is selected. */
  allSelected: boolean
}

export interface SlideshowStageProps {
  /** The SELECTED seats (seat order); each carries its `picks`. */
  seats: SlideshowSeat[]
  /** Read `seat.picks[slideIndex]` per seat. */
  slideIndex: number
  /** Cards per pack (for fit math in U6). */
  cardsPerPack: number
}

export interface SlideshowNavProps {
  slideIndex: number
  slideCount: number
  /** e.g. "Pack 1 · Pick 2" or "Leaders · Pick 1". */
  label: string
  onPrev: () => void
  onNext: () => void
}

// ---------------------------------------------------------------------------
// DraftSlideshow shell
// ---------------------------------------------------------------------------

export interface DraftSlideshowProps {
  /** Draft share id — used to fetch the all-seats slideshow payload. */
  shareId: string
  /** Set code — drives the immersive set-art background. */
  setCode: string
  /** Close the overlay (toggle off). */
  onClose: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

/** Build the bottom-nav label from a pick's pack/pickInPack. */
function pickLabel(pick: { packNumber: number; pickInPack: number } | undefined): string {
  if (!pick) return ''
  return pick.packNumber === 0
    ? `Leaders · Pick ${pick.pickInPack}`
    : `Pack ${pick.packNumber} · Pick ${pick.pickInPack}`
}

export function DraftSlideshow({ shareId, setCode, onClose }: DraftSlideshowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [data, setData] = useState<SlideshowResponse | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedSeats, setSelectedSeats] = useState<Set<number>>(() => new Set())

  const seats: SlideshowSeat[] = useMemo(() => data?.seats ?? [], [data])
  const slideCount = data?.slideCount ?? 0
  const cardsPerPack = data?.cardsPerPack ?? 0
  const packArtUrl = setCode ? getPackArtUrl(setCode) : null

  // Seat numbers that are selectable (unlocked). Locked seats never enter the set.
  const unlockedSeatNumbers = useMemo(
    () => seats.filter(s => !s.locked).map(s => s.seatNumber),
    [seats],
  )

  // Lazy-fetch the all-seats payload on first open only.
  useEffect(() => {
    let cancelled = false
    async function fetchSlideshow() {
      try {
        setLoadState('loading')
        const res = await fetch(`/api/draft/${shareId}/report/slideshow`, { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) setLoadState('error')
          return
        }
        const body: SlideshowResponse = await res.json()
        if (cancelled) return
        setData(body)
        // Default selection = ALL unlocked seats; slide 0.
        const unlocked = (body.seats || []).filter(s => !s.locked).map(s => s.seatNumber)
        setSelectedSeats(new Set(unlocked))
        setSlideIndex(0)
        setLoadState('ready')
      } catch {
        if (!cancelled) setLoadState('error')
      }
    }
    fetchSlideshow()
    return () => {
      cancelled = true
    }
  }, [shareId])

  // Keep slideIndex clamped to [0, slideCount-1] when data arrives/changes.
  useEffect(() => {
    if (slideCount <= 0) return
    setSlideIndex(i => Math.min(Math.max(i, 0), slideCount - 1))
  }, [slideCount])

  // Selection handlers — selection can never be emptied (keeps the stage non-blank).
  const onToggleSeat = useCallback((seatNumber: number) => {
    setSelectedSeats(prev => {
      const next = new Set(prev)
      if (next.has(seatNumber)) {
        if (next.size <= 1) return prev // never deselect the last seat
        next.delete(seatNumber)
      } else {
        next.add(seatNumber)
      }
      return next
    })
  }, [])

  const onSelectAll = useCallback(() => {
    setSelectedSeats(new Set(unlockedSeatNumbers))
  }, [unlockedSeatNumbers])

  const onPrev = useCallback(() => {
    setSlideIndex(i => Math.max(0, i - 1))
  }, [])

  const onNext = useCallback(() => {
    setSlideIndex(i => (slideCount > 0 ? Math.min(slideCount - 1, i + 1) : i))
  }, [slideCount])

  // Body scroll-lock + Escape + focus management (mirror Modal.tsx, minus overflow trap).
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Constrain the Tab loop to focusables INSIDE the overlay (tabs + nav).
      // Stage cards are tabIndex=-1 (U6) so they never enter this list.
      if (e.key === 'Tab' && containerRef.current) {
        const focusables = Array.from(
          containerRef.current.querySelectorAll(FOCUSABLE),
        ) as HTMLElement[]
        if (focusables.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onClose, FOCUSABLE],
  )

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the overlay container so Escape/Tab work immediately.
    const raf = requestAnimationFrame(() => {
      containerRef.current?.focus?.()
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocusedRef.current?.focus?.()
    }
  }, [handleKeyDown])

  // Derived view state.
  const selectedSeatsList = useMemo(
    () => seats.filter(s => selectedSeats.has(s.seatNumber)),
    [seats, selectedSeats],
  )
  const allSelected =
    unlockedSeatNumbers.length > 0 &&
    unlockedSeatNumbers.every(n => selectedSeats.has(n))

  // Nav label: read from any selected seat's pick at the current slide.
  const label = useMemo(() => {
    const seatWithPicks = selectedSeatsList.find(s => s.picks && s.picks.length > 0)
    return pickLabel(seatWithPicks?.picks?.[slideIndex])
  }, [selectedSeatsList, slideIndex])

  const backgroundStyle = packArtUrl
    ? {
        backgroundImage: `url("${packArtUrl}")`,
        backgroundSize: 'cover' as const,
        backgroundPosition: 'center center' as const,
        backgroundRepeat: 'no-repeat' as const,
      }
    : undefined

  return (
    <div
      ref={containerRef}
      className="draft-slideshow page-background-with-art"
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow Mode"
      tabIndex={-1}
    >
      {/* Immersive background: full-viewport set art behind a darkening scrim. */}
      {packArtUrl && <div className="draft-slideshow-bg" style={backgroundStyle} aria-hidden="true" />}
      <div className="draft-slideshow-scrim" aria-hidden="true" />

      {/* Close affordance (always available, even during loading/error). */}
      <Button
        variant="icon"
        size="sm"
        className="draft-slideshow-close"
        onClick={onClose}
        aria-label="Exit Slideshow Mode"
      >
        &times;
      </Button>

      {loadState === 'ready' ? (
        <div className="draft-slideshow-layout">
          <div className="draft-slideshow-tabbar">
            <SlideshowPlayerTabs
              seats={seats}
              selectedSeats={selectedSeats}
              onToggleSeat={onToggleSeat}
              onSelectAll={onSelectAll}
              allSelected={allSelected}
            />
          </div>

          <div className="draft-slideshow-stage">
            <SlideshowStage
              seats={selectedSeatsList}
              slideIndex={slideIndex}
              cardsPerPack={cardsPerPack}
            />
          </div>

          <div className="draft-slideshow-navbar">
            <SlideshowNav
              slideIndex={slideIndex}
              slideCount={slideCount}
              label={label}
              onPrev={onPrev}
              onNext={onNext}
            />
          </div>
        </div>
      ) : (
        // Loading / error both live in the stage band; tabs + nav are hidden so
        // the reserved chrome doesn't render half-built. Background stays visible.
        <div className="draft-slideshow-layout">
          <div className="draft-slideshow-tabbar" aria-hidden="true" />
          <div className="draft-slideshow-stage draft-slideshow-stage--message">
            {loadState === 'loading' ? (
              <div className="draft-slideshow-loading">
                <div className="draft-slideshow-spinner" aria-hidden="true" />
                <span>Loading draft data…</span>
              </div>
            ) : (
              <div className="draft-slideshow-error">
                <p>Couldn&apos;t load the slideshow.</p>
                <Button variant="back" onClick={onClose}>
                  Close
                </Button>
              </div>
            )}
          </div>
          <div className="draft-slideshow-navbar" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

export default DraftSlideshow
