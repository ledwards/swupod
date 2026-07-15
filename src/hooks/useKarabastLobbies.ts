'use client'

import { useState, useEffect, useRef } from 'react'

export interface KarabastLobby {
  name: string
  waiting: number
  /** Derived from the protectthepod.com lobby-name marker (R33). */
  isPtp: boolean
  lobbyId?: string | null
}

/**
 * Karabast public limited lobbies, relayed by the Wayfinder Companion via the
 * `wayfinder:lobby-list` postMessage (R33 — extends the count-only
 * `wayfinder:lobby-count` pipe). Without a Companion nothing ever arrives and
 * `available` stays false — the board renders the PluginCTA pitch instead (R36).
 */
export function useKarabastLobbies(): { available: boolean; lobbies: KarabastLobby[] } {
  const [available, setAvailable] = useState(false)
  const [lobbies, setLobbies] = useState<KarabastLobby[]>([])
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    function onMessage(e: MessageEvent): void {
      if (e.source !== window || !e.data || typeof e.data !== 'object') return
      if (e.data.type === 'wayfinder:lobby-list' && Array.isArray(e.data.lobbies)) {
        lastUpdateRef.current = Date.now()
        setAvailable(true)
        setLobbies(
          e.data.lobbies.map((l: Record<string, unknown>) => ({
            name: String(l.name ?? 'Karabast lobby'),
            waiting: typeof l.waiting === 'number' ? l.waiting : 1,
            isPtp: l.isPtp === true || /protectthepod\.com/i.test(String(l.name ?? '')),
            lobbyId: l.lobbyId ? String(l.lobbyId) : null,
          }))
        )
      }
    }
    window.addEventListener('message', onMessage)

    // The Companion re-sends the list every 10s. If the relay goes quiet
    // (orphaned content script after an extension reload, closed tab,
    // throttling), stale lobbies must not sit on the board — drop them.
    const staleTimer = window.setInterval(() => {
      if (lastUpdateRef.current !== 0 && Date.now() - lastUpdateRef.current > 35_000) {
        lastUpdateRef.current = 0
        setLobbies([])
      }
    }, 5_000)

    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(staleTimer)
    }
  }, [])

  return { available, lobbies }
}
