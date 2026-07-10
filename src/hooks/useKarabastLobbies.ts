'use client'

import { useState, useEffect } from 'react'

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

  useEffect(() => {
    function onMessage(e: MessageEvent): void {
      if (e.source !== window || !e.data || typeof e.data !== 'object') return
      if (e.data.type === 'wayfinder:lobby-list' && Array.isArray(e.data.lobbies)) {
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
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return { available, lobbies }
}
