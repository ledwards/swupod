'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import SlideshowNav from './SlideshowNav'
import SlideshowPlayerTabs from './SlideshowPlayerTabs'
import SlideshowStage from './SlideshowStage'
import { getPackArtUrl } from '../utils/packArt'
import type { DraftSlideshowData, SeatSelection, SlideshowPick } from './draftSlideshowTypes'
import './DraftSlideshow.css'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

interface DraftSlideshowProps {
  data: DraftSlideshowData | null
  loading: boolean
  error: string | null
  setCode: string | null | undefined
  onClose: () => void
}

function getUnlockedSeatNumbers(data: DraftSlideshowData | null | undefined): number[] {
  return (data?.seats || [])
    .filter(seat => !seat.locked && seat.picks)
    .map(seat => seat.seatNumber)
}

function findCurrentPick(
  data: DraftSlideshowData | null | undefined,
  selectedSeats: SeatSelection,
  slideIndex: number
): SlideshowPick | null {
  const seats = data?.seats || []
  const selected = seats.find(seat => selectedSeats.has(seat.seatNumber) && seat.picks)
  return selected?.picks?.[slideIndex] || seats.find(seat => seat.picks)?.picks?.[slideIndex] || null
}

function collectNeighborImageUrls(
  data: DraftSlideshowData | null | undefined,
  selectedSeats: SeatSelection,
  slideIndex: number
): string[] {
  const urls = new Set<string>()
  const seats = data?.seats || []
  const indices = [slideIndex - 1, slideIndex + 1].filter(index => index >= 0 && index < (data?.slideCount || 0))
  for (const seat of seats) {
    if (!selectedSeats.has(seat.seatNumber) || !seat.picks) continue
    for (const index of indices) {
      const pick = seat.picks[index]
      for (const card of pick?.visibleCards || []) {
        if (card.imageUrl) urls.add(card.imageUrl)
      }
    }
  }
  return Array.from(urls)
}

function getSingleSelectionNeighbors(
  data: DraftSlideshowData | null | undefined,
  selectedSeats: SeatSelection
) {
  const unlockedSeats = (data?.seats || [])
    .filter(seat => !seat.locked && seat.picks)
    .sort((a, b) => a.seatNumber - b.seatNumber)
  const selected = unlockedSeats.filter(seat => selectedSeats.has(seat.seatNumber))

  if (selected.length !== 1) {
    return { previousPlayer: null, nextPlayer: null }
  }

  const selectedSeat = selected[0]
  if (!selectedSeat) {
    return { previousPlayer: null, nextPlayer: null }
  }

  const currentIndex = unlockedSeats.findIndex(seat => seat.seatNumber === selectedSeat.seatNumber)
  return {
    previousPlayer: currentIndex > 0 ? unlockedSeats[currentIndex - 1] ?? null : null,
    nextPlayer: currentIndex >= 0 && currentIndex < unlockedSeats.length - 1 ? unlockedSeats[currentIndex + 1] ?? null : null,
  }
}

export default function DraftSlideshow({
  data,
  loading,
  error,
  setCode,
  onClose,
}: DraftSlideshowProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedSeats, setSelectedSeats] = useState<SeatSelection>(() => new Set())
  const [focusedSeat, setFocusedSeat] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  const slideCount = data?.slideCount || 0
  const packArtUrl = setCode ? getPackArtUrl(setCode) : null
  const backgroundStyle: CSSProperties | undefined = packArtUrl ? { backgroundImage: `url("${packArtUrl}")` } : undefined

  useEffect(() => {
    const unlocked = getUnlockedSeatNumbers(data)
    setSelectedSeats(prev => {
      const next = new Set([...prev].filter(seatNumber => unlocked.includes(seatNumber)))
      if (next.size > 0) return next
      return new Set(unlocked)
    })
  }, [data])

  useEffect(() => {
    if (slideCount <= 0) {
      setSlideIndex(0)
      return
    }
    setSlideIndex(index => Math.min(Math.max(index, 0), slideCount - 1))
  }, [slideCount])

  const handleSlideChange = useCallback((nextIndex: number) => {
    setSlideIndex(Math.min(Math.max(nextIndex, 0), Math.max(0, slideCount - 1)))
  }, [slideCount])

  const handlePlayerBoundaryChange = useCallback((seatNumber: number, nextSlideIndex: number) => {
    setSelectedSeats(new Set([seatNumber]))
    setSlideIndex(Math.min(Math.max(nextSlideIndex, 0), Math.max(0, slideCount - 1)))
  }, [slideCount])

  // Players currently shown as rows, in on-screen (seat) order. Drives the
  // click-to-focus ring and Up/Down cycling.
  const visibleSeatNumbers = useMemo(() => {
    return (data?.seats || [])
      .filter(seat => selectedSeats.has(seat.seatNumber) && !seat.locked && seat.picks)
      .map(seat => seat.seatNumber)
      .sort((a, b) => a - b)
  }, [data, selectedSeats])

  // Click an avatar to ring that player + their pack; click it again to clear.
  const handleFocusSeat = useCallback((seatNumber: number) => {
    setFocusedSeat(prev => (prev === seatNumber ? null : seatNumber))
  }, [])

  // Up/Down cycle the focus ring through the on-screen players (wraps around).
  const cycleFocus = useCallback((direction: 1 | -1) => {
    setFocusedSeat(prev => {
      const list = visibleSeatNumbers
      if (list.length <= 1) return null
      if (prev == null) return (direction === 1 ? list[0] : list[list.length - 1]) ?? null
      const index = list.indexOf(prev)
      if (index === -1) return (direction === 1 ? list[0] : list[list.length - 1]) ?? null
      return list[(index + direction + list.length) % list.length] ?? null
    })
  }, [visibleSeatNumbers])

  // Drop the ring if its player is gone, or when only one player is shown
  // (single-player view has no selector).
  useEffect(() => {
    setFocusedSeat(prev => {
      if (prev == null) return prev
      if (visibleSeatNumbers.length <= 1 || !visibleSeatNumbers.includes(prev)) return null
      return prev
    })
  }, [visibleSeatNumbers])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return undefined

    document.body.classList.add('draft-slideshow-mode-active')
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFrame = requestAnimationFrame(() => {
      overlayRef.current?.focus?.()
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.classList.remove('draft-slideshow-mode-active')
      document.body.style.overflow = previousOverflow
      previouslyFocusedRef.current?.focus?.()
    }
  }, [mounted])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !overlayRef.current) return

      const focusables = Array.from(overlayRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Up/Down cycle the player focus ring through the on-screen players.
  useEffect(() => {
    const handleArrowFocus = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      cycleFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('keydown', handleArrowFocus)
    return () => window.removeEventListener('keydown', handleArrowFocus)
  }, [cycleFocus])

  useEffect(() => {
    if (!data || selectedSeats.size === 0) return
    for (const src of collectNeighborImageUrls(data, selectedSeats, slideIndex)) {
      const image = new Image()
      image.src = src
    }
  }, [data, selectedSeats, slideIndex])

  const currentPick = useMemo(
    () => findCurrentPick(data, selectedSeats, slideIndex),
    [data, selectedSeats, slideIndex]
  )
  const { previousPlayer, nextPlayer } = useMemo(
    () => getSingleSelectionNeighbors(data, selectedSeats),
    [data, selectedSeats]
  )

  const slideshow = (
    <div
      ref={overlayRef}
      className="draft-slideshow-overlay page-background-with-art"
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow Mode"
      tabIndex={-1}
      data-testid="draft-slideshow"
    >
      {packArtUrl && <div className="draft-slideshow-art" style={backgroundStyle} />}
      <div className="draft-slideshow-scrim" />
      <div className="draft-slideshow-shell">
        <div className="draft-slideshow-topbar">
          {loading ? (
            <div className="draft-slideshow-tabs-placeholder" />
          ) : data ? (
            <SlideshowPlayerTabs
              seats={data.seats || []}
              selectedSeats={selectedSeats}
              onSelectionChange={setSelectedSeats}
            />
          ) : (
            <div className="draft-slideshow-tabs-placeholder" />
          )}
          <Button
            variant="secondary"
            size="sm"
            className="draft-slideshow-close"
            onClick={onClose}
            aria-label="Exit Slideshow Mode"
            title="Exit Slideshow Mode"
          >
            <CloseIcon />
          </Button>
        </div>

        {loading ? (
          <div className="draft-slideshow-center-state">Loading draft data...</div>
        ) : error ? (
          <div className="draft-slideshow-center-state draft-slideshow-center-state--error">
            <div>{error}</div>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : data ? (
          <SlideshowStage
            seats={data.seats || []}
            selectedSeats={selectedSeats}
            slideIndex={slideIndex}
            focusedSeat={focusedSeat}
            onFocusSeat={handleFocusSeat}
          />
        ) : (
          <div className="draft-slideshow-center-state">No slideshow data available.</div>
        )}

        <div className="draft-slideshow-bottom">
          {!loading && !error && data && (
            <SlideshowNav
              slideIndex={slideIndex}
              slideCount={slideCount}
              currentPick={currentPick}
              onSlideChange={handleSlideChange}
              previousPlayer={previousPlayer}
              nextPlayer={nextPlayer}
              onPlayerBoundaryChange={handlePlayerBoundaryChange}
            />
          )}
        </div>
      </div>
    </div>
  )

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(slideshow, document.body)
}
