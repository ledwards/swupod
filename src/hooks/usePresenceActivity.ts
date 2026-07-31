'use client'

import { useEffect } from 'react'
import { io as socketIO, type Socket } from 'socket.io-client'

export type PresenceActivity = 'drafting' | 'building'

/**
 * Declare what this page is: the signal behind the lobby's live strip
 * ("N online — X drafting · Y building · Z browsing").
 *
 * This is deliberately explicit rather than inferred from the feature rooms a
 * page happens to join. Room membership turned out to be a poor proxy: the
 * deck builder joins the draft room of the pod its pool came from, so it read
 * as "drafting", and the pool-builds socket it would have been identified by
 * does not reliably connect. A page saying what it is cannot drift like that.
 *
 * Anonymous visitors are not counted as online, so the server ignores their
 * activity too — the buckets always sum to the total.
 */
export function usePresenceActivity(activity: PresenceActivity | null): void {
  useEffect(() => {
    if (!activity) return
    let socket: Socket | null = null
    try {
      socket = socketIO()
      const announce = (): void => {
        socket?.emit('presence:join')
        socket?.emit('presence:activity', activity)
      }
      // The socket may already be live (socket.io multiplexes identical
      // options), in which case 'connect' never fires again.
      if (socket.connected) announce()
      socket.on('connect', announce)
    } catch {
      // The strip is decoration — never break a page over it.
    }
    return () => {
      socket?.emit('presence:activity', null)
      socket?.disconnect()
    }
  }, [activity])
}
