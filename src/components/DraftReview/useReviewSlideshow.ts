'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveSlideshow } from '../../hooks/useLiveSlideshow'
import { followTailIndex, pickLabel, toggleAllSeats, toggleSeat } from '../../services/draftReview/slideshowModel'
import type { SlideshowResponse, SlideshowSeat } from '@/app/api/draft/[shareId]/report/slideshow/route'

export type ReviewLoadState = 'loading' | 'ready' | 'error'

/**
 * The slideshow's data and navigation for the themed review and observer pages:
 * a one-shot fetch for a finished draft, or the live observer feed (refetched on
 * every pick, optionally following the latest pick). The same rules as the
 * legacy DraftSlideshow overlay, without its full-viewport chrome.
 */
export function useReviewSlideshow(shareId: string, { live = false, followTail = false }: { live?: boolean; followTail?: boolean } = {}) {
  const liveFeed = useLiveSlideshow(shareId, 'observer', { enabled: live })
  const [data, setData] = useState<SlideshowResponse | null>(null)
  const [loadState, setLoadState] = useState<ReviewLoadState>('loading')
  const [slideIndex, setSlideIndex] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const initialized = useRef(false)
  const previousCount = useRef(0)
  const slideRef = useRef(0)

  // A finished draft: fetch once.
  useEffect(() => {
    if (live) return
    let cancelled = false
    setLoadState('loading')
    fetch(`/api/draft/${shareId}/report/slideshow`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() as Promise<SlideshowResponse> : Promise.reject(new Error('unavailable'))))
      .then(body => {
        if (cancelled) return
        setData(body)
        setSelected(new Set((body.seats || []).filter(s => !s.locked).map(s => s.seatNumber)))
        setSlideIndex(0)
        setLoadState('ready')
      })
      .catch(() => { if (!cancelled) setLoadState('error') })
    return () => { cancelled = true }
  }, [shareId, live])

  // Live: mirror the feed; choose seats (and the starting slide) once.
  useEffect(() => {
    if (!live) return
    setLoadState(liveFeed.loadState)
    if (!liveFeed.data) return
    setData(liveFeed.data)
    if (!initialized.current) {
      const start = followTail ? Math.max((liveFeed.data.slideCount || 1) - 1, 0) : 0
      setSelected(new Set((liveFeed.data.seats || []).filter(s => !s.locked).map(s => s.seatNumber)))
      setSlideIndex(start)
      slideRef.current = start
      initialized.current = true
    }
  }, [live, liveFeed.data, liveFeed.loadState, followTail])

  const seats: SlideshowSeat[] = useMemo(() => data?.seats ?? [], [data])
  const slideCount = data?.slideCount ?? 0
  const openSeats = useMemo(() => seats.filter(s => !s.locked).map(s => s.seatNumber), [seats])

  useEffect(() => {
    if (slideCount > 0) setSlideIndex(i => Math.min(Math.max(i, 0), slideCount - 1))
  }, [slideCount])
  useEffect(() => { slideRef.current = slideIndex }, [slideIndex])

  // Follow the latest pick: dwell a second on the pick just made, then move on.
  useEffect(() => {
    const before = previousCount.current
    previousCount.current = slideCount
    if (!followTail) return
    const target = followTailIndex({ current: slideRef.current, previousCount: before, nextCount: slideCount })
    if (target === null) return
    const t = setTimeout(() => setSlideIndex(target), 1000)
    return () => clearTimeout(t)
  }, [slideCount, followTail])

  const onToggleSeat = useCallback((seat: number) => setSelected(prev => toggleSeat(prev, seat)), [])
  const onToggleAll = useCallback(() => setSelected(prev => toggleAllSeats(prev, openSeats)), [openSeats])
  const onPrev = useCallback(() => setSlideIndex(i => Math.max(0, i - 1)), [])
  const onNext = useCallback(() => setSlideIndex(i => (slideCount > 0 ? Math.min(slideCount - 1, i + 1) : i)), [slideCount])

  const selectedSeats = useMemo(() => seats.filter(s => selected.has(s.seatNumber)), [seats, selected])
  const allSelected = openSeats.length > 0 && openSeats.every(n => selected.has(n))
  const label = useMemo(() => pickLabel(selectedSeats.find(s => s.picks?.length)?.picks?.[slideIndex]), [selectedSeats, slideIndex])

  return {
    data, loadState, error: live ? liveFeed.error : null, timer: liveFeed.timer,
    seats, selected, selectedSeats, allSelected, slideIndex, slideCount, label,
    atTail: slideCount > 0 && slideIndex >= slideCount - 1,
    onToggleSeat, onToggleAll, onPrev, onNext,
  }
}
