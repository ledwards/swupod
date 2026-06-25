// @ts-nocheck
'use client'

/**
 * useLiveSlideshow — live, read-only slideshow data for the Privileged Observer
 * (in-progress drafts).
 *
 * Mirrors useDraftSocket's socket-subscribe + version-gated refetch, but hits
 * the GATED slideshow live endpoint instead of the participant draft endpoint —
 * so it works for unauthenticated public observers.
 *
 *   - Initial: GET /api/draft/:shareId/report/slideshow?live=1&mode=<mode>
 *   - On each socket `state` broadcast (every pick): update the timer block
 *     instantly from the payload, and refetch the slideshow when stateVersion
 *     bumps (new picks appended → slideCount grows).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { SlideshowResponse, SlideshowTimer } from '@/app/api/draft/[shareId]/report/slideshow/route'

export type LiveLoadState = 'loading' | 'ready' | 'error'

export interface UseLiveSlideshowReturn {
  data: SlideshowResponse | null
  timer: SlideshowTimer | null
  loadState: LiveLoadState
  error: string | null
  connected: boolean
}

export function useLiveSlideshow(
  shareId: string | null,
  mode: 'observer',
  { enabled = true }: { enabled?: boolean } = {},
): UseLiveSlideshowReturn {
  const [data, setData] = useState<SlideshowResponse | null>(null)
  const [timer, setTimer] = useState<SlideshowTimer | null>(null)
  const [loadState, setLoadState] = useState<LiveLoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const stateVersionRef = useRef(0)

  const fetchSlideshow = useCallback(async (showLoading = true): Promise<void> => {
    if (!shareId) return
    if (showLoading) setLoadState('loading')
    try {
      const res = await fetch(
        `/api/draft/${shareId}/report/slideshow?live=1&mode=${mode}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Failed to load')
        setLoadState('error')
        return
      }
      const body: SlideshowResponse = await res.json()
      setData(body)
      if (body.timer) setTimer(body.timer)
      setError(null)
      setLoadState('ready')
    } catch {
      setError('Failed to load')
      setLoadState('error')
    }
  }, [shareId, mode])

  useEffect(() => {
    if (!shareId || !enabled) return

    fetchSlideshow()

    const socket: Socket = io()
    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join-draft', shareId)
      // Catch any picks made between the initial fetch and socket connect.
      fetchSlideshow(false)
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('state', (payload: any) => {
      // Update the timer immediately from the broadcast (fires every pick).
      setTimer(prev => ({
        status: payload.status ?? prev?.status ?? 'active',
        paused: payload.paused === true,
        pausedAt: payload.pausedAt ?? null,
        pausedDurationSeconds: payload.pausedDurationSeconds || 0,
        pickStartedAt: payload.pickStartedAt ?? null,
        timerEnabled: payload.timerEnabled !== false,
        timerSeconds: payload.timerSeconds || prev?.timerSeconds || 0,
        pickTimeoutSeconds: payload.pickTimeoutSeconds || prev?.pickTimeoutSeconds || 60,
        competitive: payload.competitive ?? prev?.competitive ?? false,
        draftState: payload.draftState ?? prev?.draftState ?? {},
      }))
      // Refetch picks when the draft state advances (new pick appended).
      if (typeof payload.stateVersion === 'number' && payload.stateVersion > stateVersionRef.current) {
        stateVersionRef.current = payload.stateVersion
        fetchSlideshow(false)
      }
    })

    socket.on('deleted', () => {
      setError('This draft is no longer available')
      setLoadState('error')
    })

    return () => {
      socket.emit('leave-draft', shareId)
      socket.disconnect()
    }
  }, [shareId, enabled, fetchSlideshow])

  return { data, timer, loadState, error, connected }
}

export default useLiveSlideshow
