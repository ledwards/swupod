'use client'

/**
 * Site-wide open-game event toasts (U5, R21): a poster browsing anywhere on
 * the site learns their game was accepted / cancelled / completed via a
 * dismissable, click-to-navigate toast — never an automatic redirect.
 *
 * Events arrive on the per-user socket room (joined at presence:join).
 */
import { useEffect } from 'react'
import { io as socketIO, type Socket } from 'socket.io-client'
import { useAuth } from '@/src/contexts/AuthContext'
import { useToast } from '@/src/components/Toast'

interface OpenGameEvent {
  type: string
  shareId?: string
}

// Lobby-language copy: these events are about the LOBBY lifecycle; only
// `complete` talks about a game result.
const TOAST_COPY: Record<string, { text: string; kind: 'info' | 'success' | 'danger'; action: string }> = {
  accepted: { text: 'Someone joined your lobby!', kind: 'success', action: 'Go to lobby' },
  opponent_joined: { text: 'Your opponent is in the Karabast lobby.', kind: 'success', action: 'Open lobby' },
  lobby_ready: { text: 'Your Karabast lobby is ready.', kind: 'info', action: 'Open lobby' },
  cancelled: { text: 'Your opponent cancelled the lobby.', kind: 'danger', action: 'View lobby' },
  complete: { text: 'Result recorded.', kind: 'success', action: 'View result' },
}

export default function OpenGameEventToasts(): null {
  const { user } = useAuth() as { user: { id: string } | null }
  const { showToast } = useToast()

  useEffect(() => {
    if (!user?.id) return
    let socket: Socket | null = null
    try {
      socket = socketIO({ transports: ['websocket', 'polling'] })
      socket.on('connect', () => {
        socket?.emit('presence:join')
      })
      socket.on('open-game:event', (event: OpenGameEvent) => {
        const copy = TOAST_COPY[event.type]
        if (!copy) return
        // Suppress when the user is already looking at this match page.
        if (event.shareId && window.location.pathname === `/g/${event.shareId}`) return
        showToast({
          text: copy.text,
          kind: copy.kind,
          href: event.shareId ? `/g/${event.shareId}` : '/lobby',
          actionLabel: copy.action,
        })
      })
    } catch {
      // Socket unavailability never breaks the page.
    }
    return () => {
      socket?.disconnect()
    }
  }, [user?.id, showToast])

  return null
}
