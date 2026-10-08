// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

// === TYPES ===

interface RotisseriePlayer {
  id: string
  name: string
  seat: number
  avatarUrl?: string
}

interface PickedCard {
  cardInstanceId: string
  playerId: string
  pickNumber: number
}

interface CardData {
  id: string
  instanceId: string
  name: string
  type: string
  cost?: number
  aspects?: string[]
  frontArt?: string
  set?: string
  number?: string
  rarity?: string
}

interface RotisserieData {
  shareId: string
  status: 'waiting' | 'active' | 'completed'
  players: RotisseriePlayer[]
  maxPlayers: number
  setCodes: string[]
  picksPerPlayer: number
  timerEnabled: boolean
  pickTimerSeconds: number
  currentPickerIndex: number
  pickDirection: number
  pickNumber: number
  totalPicks: number
  pickedCards: PickedCard[]
  cardPool: CardData[]
  leaders: CardData[]
  bases: CardData[]
  lastPickTimestamp: number
  createdAt: string
}

interface UseRotisserieSocketOptions {
  enabled?: boolean
}

export interface UseRotisserieSocketReturn {
  data: RotisserieData | null
  loading: boolean
  error: string | null
  deleted: boolean
  connected: boolean
  refresh: () => Promise<void>
}

// === HOOK ===

/**
 * Hook for syncing rotisserie draft state via WebSocket (Socket.io)
 *
 * @param shareId - Rotisserie draft share ID
 * @param options - Options
 * @returns Rotisserie state and controls
 */
export function useRotisserieSocket(
  shareId: string | null,
  { enabled = true }: UseRotisserieSocketOptions = {}
): UseRotisserieSocketReturn {
  const [data, setData] = useState<RotisserieData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef<Socket | null>(null)

  // Fetch rotisserie state via HTTP
  const fetchData = useCallback(async (showLoading = true) => {
    if (!shareId) return
    if (showLoading) {
      setLoading(true)
    }
    setError(null)
    try {
      const response = await fetch(`/api/formats/rotisserie/${shareId}`, {
        credentials: 'include'
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.message || 'Failed to load draft')
      }
      const result = await response.json()
      // API wraps response in { success, data, message }
      setData(result.data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [shareId])

  useEffect(() => {
    if (!shareId || !enabled) return

    // Initial load via HTTP
    fetchData()

    // Connect to Socket.io for real-time notifications
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setError(null)
      socket.emit('join-rotisserie', shareId)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err)
      setError('Connection error')
    })

    // When state changes, update local state
    socket.on('state', (newData: RotisserieData) => {
      setData(newData)
    })

    socket.on('deleted', () => {
      setDeleted(true)
    })

    return () => {
      socket.emit('leave-rotisserie', shareId)
      socket.disconnect()
    }
  }, [shareId, enabled, fetchData])

  // Manual refresh
  const refresh = useCallback(async (): Promise<void> => {
    await fetchData(false)
  }, [fetchData])

  return {
    data,
    loading,
    error,
    deleted,
    connected,
    refresh,
  }
}

export default useRotisserieSocket
