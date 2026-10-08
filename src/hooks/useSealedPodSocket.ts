// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

interface SealedPodPlayer {
  id: string
  username: string
  avatarUrl: string
  seatNumber: number
}

interface SealedPod {
  id: string
  shareId: string
  setCode: string
  setName: string
  name: string | null
  setArtUrl: string
  status: string
  maxPlayers: number
  currentPlayers: number
  stateVersion: number
  settings: Record<string, unknown>
  host: {
    id: string
    username: string
    avatarUrl: string
  }
  players: SealedPodPlayer[]
  isHost: boolean
  isPlayer: boolean
  competitive?: boolean
  deckBuildDeadline?: string | null
  decksUnlocked?: boolean
  createdAt: string
}

interface SocketStateData {
  stateVersion: number
  status: string
  currentPlayers: number
  maxPlayers: number
  competitive?: boolean
  deckBuildDeadline?: string | null
  decksUnlocked?: boolean
  settings: Record<string, unknown>
  players: SealedPodPlayer[]
  timestamp: number
}

export interface UseSealedPodSocketReturn {
  pod: SealedPod | null
  loading: boolean
  error: string | null
  deleted: boolean
  connected: boolean
  refresh: () => Promise<void>
}

async function loadSealedPod(shareId: string): Promise<SealedPod> {
  const response = await fetch(`/api/sealed/${shareId}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || `Failed to load sealed pod (${response.status})`)
  }
  const json = await response.json()
  return json.data || json
}

export function useSealedPodSocket(
  shareId: string | null,
  { enabled = true }: { enabled?: boolean } = {}
): UseSealedPodSocketReturn {
  const [pod, setPod] = useState<SealedPod | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const stateVersionRef = useRef(0)

  const fetchPod = useCallback(async (showLoading = true) => {
    if (!shareId) return
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const data = await loadSealedPod(shareId)
      setPod(data)
      stateVersionRef.current = data.stateVersion || 0
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [shareId])

  useEffect(() => {
    if (!shareId || !enabled) return

    fetchPod()

    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setError(null)
      socket.emit('join-sealed', shareId)
      // Refresh to catch any broadcasts missed between initial fetch and socket connection
      fetchPod(false)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('connect_error', (err: Error) => {
      console.error('Sealed pod socket connection error:', err)
      setError('Connection error')
    })

    socket.on('sealed-state', (data: SocketStateData) => {
      if (data.stateVersion > stateVersionRef.current) {
        stateVersionRef.current = data.stateVersion

        // Update public state immediately
        setPod(prev => prev ? {
          ...prev,
          status: data.status,
          currentPlayers: data.currentPlayers,
          maxPlayers: data.maxPlayers,
          competitive: data.competitive === true,
          deckBuildDeadline: data.deckBuildDeadline ?? prev.deckBuildDeadline ?? null,
          decksUnlocked: data.decksUnlocked === true,
          settings: data.settings,
          players: data.players,
          stateVersion: data.stateVersion,
        } : null)

        // Re-fetch to get isHost/isPlayer from server
        fetchPod(false)
      }
    })

    socket.on('deleted', () => {
      setDeleted(true)
      setPod(null)
    })

    return () => {
      if (socket.connected) {
        socket.emit('leave-sealed', shareId)
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [shareId, enabled, fetchPod])

  return { pod, loading, error, deleted, connected, refresh: fetchPod }
}
