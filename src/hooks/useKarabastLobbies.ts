'use client'

import { useState, useEffect, useRef } from 'react'

export interface KarabastLobby {
  name: string
  waiting: number
  /** Derived from the protectthepod.com lobby-name marker (R33). */
  isPtp: boolean
  lobbyId?: string | null
}

/** Matches the server cache window — ~one upstream call per interval. */
const POLL_MS = 10_000
/** The Companion re-sends every 10s; drop its rows if the relay goes quiet. */
const RELAY_STALE_MS = 35_000

/**
 * Karabast public limited lobbies.
 *
 * Two sources, unioned:
 *
 *  1. `/api/karabast/lobbies` — PTP's own poll of Karabast's public endpoint.
 *     This is the one that works for EVERYONE. The board used to have only
 *     source 2, which meant any visitor without the extension saw an empty
 *     Karabast section no matter how many games were actually up.
 *  2. `wayfinder:lobby-list` postMessage from the Wayfinder Companion, when
 *     it's installed (R33). Same upstream data, so it's largely redundant now,
 *     but it costs nothing and covers the gap before the first poll returns.
 *
 * Both are deduped by lobbyId (falling back to name), so an extension user
 * never sees a row twice.
 */
export function useKarabastLobbies(): { available: boolean; lobbies: KarabastLobby[] } {
  const [serverLobbies, setServerLobbies] = useState<KarabastLobby[] | null>(null)
  const [relayLobbies, setRelayLobbies] = useState<KarabastLobby[]>([])
  const lastRelayRef = useRef(0)

  // Source 1: PTP's server-side poll.
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      fetch('/api/karabast/lobbies')
        .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then(json => {
          if (cancelled) return
          const list = (json.data || json).lobbies
          if (Array.isArray(list)) setServerLobbies(list)
        })
        .catch(() => {
          // Keep whatever we last had; a blip must not blank the board.
        })
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Source 2: the Companion relay, when present.
  useEffect(() => {
    function onMessage(e: MessageEvent): void {
      if (e.source !== window || !e.data || typeof e.data !== 'object') return
      if (e.data.type === 'wayfinder:lobby-list' && Array.isArray(e.data.lobbies)) {
        lastRelayRef.current = Date.now()
        setRelayLobbies(
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

    // An orphaned content script (extension reload, closed tab, throttling)
    // must not leave stale lobbies sitting on the board.
    const staleTimer = window.setInterval(() => {
      if (lastRelayRef.current !== 0 && Date.now() - lastRelayRef.current > RELAY_STALE_MS) {
        lastRelayRef.current = 0
        setRelayLobbies([])
      }
    }, 5_000)

    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(staleTimer)
    }
  }, [])

  const lobbies: KarabastLobby[] = []
  const seen = new Set<string>()
  for (const l of [...(serverLobbies ?? []), ...relayLobbies]) {
    const key = l.lobbyId || `name:${l.name}`
    if (seen.has(key)) continue
    seen.add(key)
    lobbies.push(l)
  }

  // "We have a working source" — true once the poll has answered, even with
  // zero lobbies, so the board renders the section rather than a plugin CTA.
  return { available: serverLobbies !== null || relayLobbies.length > 0, lobbies }
}
