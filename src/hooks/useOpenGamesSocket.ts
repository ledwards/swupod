'use client'

import { useState, useEffect, useCallback } from 'react'
import { io as socketIO, Socket } from 'socket.io-client'

export interface OpenGameListing {
  shareId: string
  setCode: string
  setName: string | null
  format: string
  createdAt: string
  host: { username: string | null; avatarUrl: string | null }
  hostConnected?: boolean
  bestOf?: number
  karabastLobbyId?: string | null
  /**
   * True when the viewing user posted this listing (computed from the session
   * by GET /api/open-games). Socket pushes are viewer-agnostic, so it's
   * preserved from the last fetch there; components also fall back to a
   * username comparison. No deck identity here (R29).
   */
  mine?: boolean
  /** Your own deck's name — present only on your listing (GET is per-viewer;
   *  socket pushes never carry it, so it's preserved from the last fetch). */
  yourDeck?: { name: string | null } | undefined
}

export interface RecentResult {
  setCode: string
  format: string
  completedAt: string
  players: Array<string | null>
}

export interface OpenGamesBoard {
  /**
   * Distinct error state (R-review): a failed load must render a retry
   * banner, never the empty-board CTA.
   */
  status: 'loading' | 'ready' | 'error'
  listings: OpenGameListing[]
  recentCompleted: RecentResult[]
  retry: () => void
}

/**
 * Live open-games board: initial HTTP fetch + 'open-games' room updates.
 * Mirrors usePublicPodsSocket, plus the explicit load-status contract.
 */
export function useOpenGamesSocket(): OpenGamesBoard {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [listings, setListings] = useState<OpenGameListing[]>([])
  const [recentCompleted, setRecentCompleted] = useState<RecentResult[]>([])

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/open-games')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const data = json.data || json
      setListings(data.listings || [])
      setRecentCompleted(data.recentCompleted || [])
      setStatus('ready')
    } catch (err) {
      console.error('Failed to fetch open games:', err)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    fetchBoard()

    let socket: Socket | null = null
    try {
      socket = socketIO({ transports: ['websocket', 'polling'] })
      socket.on('connect', () => {
        socket?.emit('join-open-games')
      })
      socket.on('open-games-update', (data: { listings: OpenGameListing[]; recentCompleted: RecentResult[] }) => {
        // Socket broadcasts are viewer-agnostic (no session): carry `mine`
        // forward from the initial fetch for listings we already know about.
        setListings(previous =>
          (data.listings || []).map(listing => {
            const known = previous.find(p => p.shareId === listing.shareId)
            return {
              ...listing,
              mine: listing.mine ?? known?.mine ?? false,
              yourDeck: listing.yourDeck ?? known?.yourDeck,
            }
          })
        )
        setRecentCompleted(data.recentCompleted || [])
        setStatus('ready')
      })
    } catch (err) {
      console.error('Failed to connect open games socket:', err)
    }

    return () => {
      if (socket) {
        socket.emit('leave-open-games')
        socket.disconnect()
      }
    }
  }, [fetchBoard])

  const retry = useCallback(() => {
    setStatus('loading')
    fetchBoard()
  }, [fetchBoard])

  return { status, listings, recentCompleted, retry }
}
