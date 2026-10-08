// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

/**
 * Pod player data from the API
 */
interface PodPlayer {
  id: string
  username: string
  avatarUrl: string | null
  seatNumber: number
  poolShareId: string | null
  isReady: boolean
}

/**
 * Match pairing data
 */
interface PodMatch {
  player1: {
    id: string
    username: string
    avatarUrl: string | null
    isReady: boolean
  }
  player2: {
    id: string
    username: string
    avatarUrl: string | null
    isReady: boolean
  }
}

/**
 * Full pod data from the API
 */
interface PodData {
  draft: {
    shareId: string
    setCode: string
    setName: string
    name: string | null
    hostId: string
    status: string
    completedAt: string | null
  }
  players: PodPlayer[]
  pairings: {
    matches: PodMatch[]
    byePlayer: {
      id: string
      username: string
      avatarUrl: string | null
    } | null
  }
  myOpponent: {
    id: string
    username: string
    avatarUrl: string | null
    isReady: boolean
    poolShareId: string | null
  } | null
  myBye: boolean
  isHost: boolean
  myPoolShareId: string | null
}

/**
 * Socket state update from server
 */
interface PodStateUpdate {
  timestamp: number
  players: Array<{
    id: string
    username: string
    avatarUrl: string | null
    seatNumber: number
    isReady: boolean
  }>
}

/**
 * Hook for syncing pod state via WebSocket.
 *
 * Initial load via HTTP, real-time readiness updates via WebSocket.
 */
export function usePodSocket(shareId: string | null) {
  const [podData, setPodData] = useState<PodData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef<Socket | null>(null)

  // Fetch full pod data via HTTP
  const fetchPod = useCallback(async (showLoading = true) => {
    if (!shareId) return
    if (showLoading) setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/draft/${shareId}/pod`, { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Failed to load pod (${res.status})`)
      }
      const json = await res.json()
      setPodData(json.data || json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pod')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [shareId])

  useEffect(() => {
    if (!shareId) return

    // Initial load via HTTP
    fetchPod()

    // Connect to Socket.io for real-time updates
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join-pod', shareId)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    // Real-time readiness updates
    socket.on('pod-state', (data: PodStateUpdate) => {
      setPodData(prev => {
        if (!prev) return prev

        // Update player readiness from socket data
        const updatedPlayers = prev.players.map(p => {
          const socketPlayer = data.players.find(sp => sp.id === p.id)
          return socketPlayer ? { ...p, isReady: socketPlayer.isReady } : p
        })

        // Update match readiness
        const updatedMatches = prev.pairings.matches.map(m => ({
          player1: {
            ...m.player1,
            isReady: data.players.find(sp => sp.id === m.player1.id)?.isReady ?? m.player1.isReady,
          },
          player2: {
            ...m.player2,
            isReady: data.players.find(sp => sp.id === m.player2.id)?.isReady ?? m.player2.isReady,
          },
        }))

        // Update my opponent readiness
        const updatedOpponent = prev.myOpponent
          ? {
              ...prev.myOpponent,
              isReady: data.players.find(sp => sp.id === prev.myOpponent.id)?.isReady ?? prev.myOpponent.isReady,
            }
          : null

        return {
          ...prev,
          players: updatedPlayers,
          pairings: { ...prev.pairings, matches: updatedMatches },
          myOpponent: updatedOpponent,
        }
      })
    })

    return () => {
      socket.emit('leave-pod', shareId)
      socket.disconnect()
    }
  }, [shareId, fetchPod])

  const refresh = useCallback(async () => {
    await fetchPod(false)
  }, [fetchPod])

  return {
    podData,
    loading,
    error,
    connected,
    refresh,
  }
}

export default usePodSocket
