// @ts-nocheck
import { useState, useEffect, useCallback } from 'react'
import { io as socketIO, Socket } from 'socket.io-client'

export interface PublicPod {
  shareId: string
  podType: string
  setCode: string
  setName: string
  maxPlayers: number
  currentPlayers: number
  host: {
    username: string
    avatarUrl: string
  }
  createdAt: string
}

/**
 * Hook that provides real-time public pods updates via WebSocket.
 * Falls back to initial HTTP fetch, then receives live updates.
 */
export function usePublicPodsSocket(): PublicPod[] {
  const [publicPods, setPublicPods] = useState<PublicPod[]>([])

  // Initial fetch
  const fetchPods = useCallback(async () => {
    try {
      const res = await fetch('/api/pods/public')
      if (res.ok) {
        const json = await res.json()
        const data = json.data || json
        setPublicPods(data.pods || [])
      }
    } catch (err) {
      console.error('Failed to fetch public pods:', err)
    }
  }, [])

  useEffect(() => {
    fetchPods()

    let socket: Socket | null = null

    try {
      socket = socketIO({
        transports: ['websocket', 'polling'],
      })

      socket.on('connect', () => {
        socket?.emit('join-public-pods')
      })

      socket.on('public-pods-update', (data: { pods: PublicPod[] }) => {
        setPublicPods(data.pods || [])
      })
    } catch (err) {
      console.error('Failed to connect public pods socket:', err)
    }

    return () => {
      if (socket) {
        socket.emit('leave-public-pods')
        socket.disconnect()
      }
    }
  }, [fetchPods])

  return publicPods
}
