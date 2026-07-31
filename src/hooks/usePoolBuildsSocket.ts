// @ts-nocheck
import { useEffect } from 'react'
import { io as socketIO, Socket } from 'socket.io-client'

/**
 * Subscribes to cross-client builds-changed updates for a pool tree.
 * The server emits `pool-builds-update` to `pool-builds:<rootShareId>` when
 * any client saves a deck state change in the tree (root pool or any child build).
 *
 * On receipt, this hook dispatches the same `wf:builds-changed` window event
 * that the local-save path already dispatches, so PoolBuilds re-fetches.
 */
export function usePoolBuildsSocket(rootShareId: string | null | undefined): void {
  useEffect(() => {
    if (!rootShareId) return
    let socket: Socket | null = null
    try {
      // Default transports — polling first, upgrading to websocket — as every
      // other socket hook here uses. This hook used to force websocket first,
      // which raised `connect_error: websocket error` on a permanent retry
      // loop and never connected, so `join-pool-builds` was never sent and
      // cross-client build updates silently did nothing.
      //
      // forceNew keeps this on its own connection. io() otherwise multiplexes
      // — the default options would hand back the socket usePresence and
      // useDraftSocket are on, and the disconnect() below would then tear
      // THEIR socket down on unmount. A dedicated socket also guarantees
      // 'connect' still fires for the join.
      socket = socketIO({ forceNew: true })
      socket.on('connect', () => {
        socket?.emit('join-pool-builds', rootShareId)
      })
      socket.on('pool-builds-update', () => {
        window.dispatchEvent(new CustomEvent('wf:builds-changed', { detail: { rootShareId } }))
      })
    } catch (err) {
      console.error('Failed to connect pool-builds socket:', err)
    }
    return () => {
      if (socket) {
        socket.emit('leave-pool-builds', rootShareId)
        socket.disconnect()
      }
    }
  }, [rootShareId])
}
