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
import TimerPanel from './TimerPanel'
import { getPackArtUrl } from '../utils/packArt'
import { useLiveSlideshow } from '../hooks/useLiveSlideshow'
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
  /** Set code — drives the immersive set-art background. Optional in live mode
   *  (falls back to the set code carried in the slideshow payload). */
  setCode?: string
  /** Close the overlay (toggle off). */
  onClose: () => void
  /**
   * Live mode (Privileged Observer): subscribe to the draft socket and refetch
   * picks as they arrive, instead of a one-shot fetch.
   */
  live?: boolean
  /** Which gated live endpoint to hit (live mode only). */
  mode?: 'observer'
  /** Show the live round/pick timer (Privileged Observer). */
  showTimer?: boolean
  /** When on the latest slide, auto-advance to new picks as they arrive. */
  followTail?: boolean
  /** Public kiosk: hide the close affordance and disable Escape-to-close. */
  publicMode?: boolean
}

type LoadState = 'loading' | 'ready' | 'error'

/** Build the bottom-nav label from a pick's pack/pickInPack. */
function pickLabel(pick: { packNumber: number; pickInPack: number } | undefined): string {
  if (!pick) return ''
  return pick.packNumber === 0
    ? `Leaders · Pick ${pick.pickInPack}`
    : `Pack ${pick.packNumber} · Pick ${pick.pickInPack}`
}

export function DraftSlideshow({
  shareId,
  setCode = '',
  onClose,
  live = false,
  mode = 'observer',
  showTimer = false,
  followTail = false,
  publicMode = false,
}: DraftSlideshowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [data, setData] = useState<SlideshowResponse | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedSeats, setSelectedSeats] = useState<Set<number>>(() => new Set())
  const initializedRef = useRef(false)
  const prevSlideCountRef = useRef(0)
  const slideIndexRef = useRef(0)

  // Live data source (Privileged Observer). No-op unless `live`.
  const liveSlideshow = useLiveSlideshow(shareId, mode, { enabled: live })

  const seats: SlideshowSeat[] = useMemo(() => data?.seats ?? [], [data])
  const slideCount = data?.slideCount ?? 0
  const cardsPerPack = data?.cardsPerPack ?? 0
  // In live mode the caller may not know the set up front; fall back to the set
  // code carried in the slideshow payload so the immersive art still resolves.
  const effectiveSetCode = setCode || data?.draft?.setCode || ''
  const packArtUrl = effectiveSetCode ? getPackArtUrl(effectiveSetCode) : null

  // Seat numbers that are selectable (unlocked). Locked seats never enter the set.
  const unlockedSeatNumbers = useMemo(
    () => seats.filter(s => !s.locked).map(s => s.seatNumber),
    [seats],
  )

  // Lazy-fetch the all-seats payload on first open only (non-live / completed
  // report). Live mode uses useLiveSlideshow instead (synced just below).
  useEffect(() => {
    if (live) return
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
  }, [shareId, live])

  // Live mode: sync useLiveSlideshow data into local state. Initialize the seat
  // selection once; later refetches preserve the viewer's selection (and, unless
  // follow-tail moves them, their current slide).
  useEffect(() => {
    if (!live) return
    setLoadState(liveSlideshow.loadState)
    if (liveSlideshow.data) {
      setData(liveSlideshow.data)
      if (!initializedRef.current) {
        const unlocked = (liveSlideshow.data.seats || []).filter(s => !s.locked).map(s => s.seatNumber)
        const initialSlideIndex = followTail
          ? Math.max((liveSlideshow.data.slideCount || 1) - 1, 0)
          : 0
        setSelectedSeats(new Set(unlocked))
        setSlideIndex(initialSlideIndex)
        slideIndexRef.current = initialSlideIndex
        initializedRef.current = true
      }
    }
  }, [live, liveSlideshow.data, liveSlideshow.loadState, followTail])

  // Keep slideIndex clamped to [0, slideCount-1] when data arrives/changes.
  useEffect(() => {
    if (slideCount <= 0) return
    setSlideIndex(i => Math.min(Math.max(i, 0), slideCount - 1))
  }, [slideCount])

  // Track the live slide so follow-tail can check "was at tail" without making
  // slideIndex a dependency of the growth effect below.
  useEffect(() => {
    slideIndexRef.current = slideIndex
  }, [slideIndex])

  // Follow-tail: when new picks arrive AND the viewer was parked on the latest
  // slide, dwell ~1s on the just-completed pick (so its highlight reads), then
  // advance to the new latest. If they've scrubbed back, leave them put.
  useEffect(() => {
    const prev = prevSlideCountRef.current
    prevSlideCountRef.current = slideCount
    if (!followTail || prev <= 0 || slideCount <= prev) return
    if (slideIndexRef.current < prev - 1) return // scrubbed back — don't follow
    const t = setTimeout(() => setSlideIndex(slideCount - 1), 1000)
    return () => clearTimeout(t)
  }, [slideCount, followTail])

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

  // Toggle: if every unlocked seat is selected, clear to none; otherwise select
  // all. (The "All" tab flips to "None" when everything is on.)
  const onSelectAll = useCallback(() => {
    setSelectedSeats(prev => {
      const allOn = unlockedSeatNumbers.length > 0 && unlockedSeatNumbers.every(n => prev.has(n))
      return allOn ? new Set<number>() : new Set(unlockedSeatNumbers)
    })
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
        if (!publicMode) onClose()
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
    [onClose, publicMode, FOCUSABLE],
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

      {/* Close affordance (hidden in public kiosk mode). */}
      {!publicMode && (
        <Button
          variant="icon"
          size="sm"
          className="draft-slideshow-close"
          onClick={onClose}
          aria-label="Exit Slideshow Mode"
        >
          &times;
        </Button>
      )}

      {/* Live round/pick timer (Privileged Observer streaming overlay). */}
      {showTimer && liveSlideshow.timer && (
        <div className="draft-slideshow-timer">
          <TimerPanel
            draft={liveSlideshow.timer}
            draftState={liveSlideshow.timer.draftState}
            compact
            isHost={false}
          />
        </div>
      )}

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
                <p>{(live && liveSlideshow.error) || "Couldn't load the slideshow."}</p>
                {!publicMode && (
                  <Button variant="back" onClick={onClose}>
                    Close
                  </Button>
                )}
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
