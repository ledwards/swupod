// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

/**
 * Live online-players count, split by what those players are doing.
 *
 * The bare total was misleading on a quiet board: "21 players online" above
 * "0 open lobbies" reads as twenty-one people who won't play with you, when
 * in truth almost all of them are mid-draft, mid-build, or just holding a tab
 * open. The server infers each bucket from the rooms a socket has joined.
 */
export interface PresenceBreakdown {
  count: number
  drafting: number
  building: number
  browsing: number
}

const EMPTY: PresenceBreakdown = { count: 0, drafting: 0, building: 0, browsing: 0 }

export function usePresence(userId?: string): PresenceBreakdown {
  const [presence, setPresence] = useState<PresenceBreakdown>(EMPTY)
  const socketRef = useRef<Socket | null>(null)

  // Always connect to receive the count (even for anonymous users)
  useEffect(() => {
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      // Subscribe to count updates (all users)
      socket.emit('presence:subscribe')
      // Register as a counted user if logged in
      if (userId) {
        socket.emit('presence:join', userId)
      }
    })

    socket.on('presence:count', (data: Partial<PresenceBreakdown>) => {
      const count = data?.count ?? 0
      const drafting = data?.drafting ?? 0
      const building = data?.building ?? 0
      // Derive rather than trust: an older server sends only `count`, and the
      // strip must still add up rather than render a nonsense remainder.
      setPresence({
        count,
        drafting,
        building,
        browsing: data?.browsing ?? Math.max(0, count - drafting - building),
      })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId])

  return presence
}
