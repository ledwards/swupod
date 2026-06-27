'use client'

import { useEffect, useState } from 'react'
import { useWayfinderDetection } from './useWayfinderDetection'

export interface WayfinderPresenceData {
  hasActivity: boolean
  recordedGames: number
  eligibleForCardStats: boolean
  requiredGames: number
}

const EMPTY_PRESENCE: WayfinderPresenceData = {
  hasActivity: false,
  recordedGames: 0,
  eligibleForCardStats: false,
  requiredGames: 5,
}

// Fetch the server presence signal once per page load and share it across every
// PluginCTA instance (module-level cache + in-flight de-dup so N CTAs = 1 fetch).
let presenceCache: WayfinderPresenceData | null = null
let presenceInFlight: Promise<WayfinderPresenceData> | null = null

function fetchPresence(): Promise<WayfinderPresenceData> {
  if (presenceCache !== null) return Promise.resolve(presenceCache)
  if (!presenceInFlight) {
    presenceInFlight = fetch('/api/me/wayfinder-presence', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        presenceCache = {
          hasActivity: Boolean(b?.data?.hasActivity),
          recordedGames: Number(b?.data?.recordedGames || 0),
          eligibleForCardStats: Boolean(b?.data?.eligibleForCardStats),
          requiredGames: Number(b?.data?.requiredGames || 5),
        }
        return presenceCache
      })
      .catch(() => {
        presenceCache = EMPTY_PRESENCE
        return EMPTY_PRESENCE
      })
  }
  return presenceInFlight
}

export interface PluginPresence {
  /** Has the Wayfinder Companion — live-detected OR proven by recorded PTP games. */
  hasPlugin: boolean
  hasActivity: boolean
  recordedGames: number
  eligibleForCardStats: boolean
  requiredGames: number
  loaded: boolean
}

/**
 * usePluginPresence — the robust "does this user have the Companion?" check.
 *
 * `detected` (the injected meta tag) only fires on :3000/prod, so on its own it
 * falsely nags installed users on other ports/pages. We OR it with a server-side
 * "has recorded games" signal (port-independent), so the install CTA disappears
 * for anyone who clearly already has the plugin — everywhere.
 */
export function usePluginPresence(): PluginPresence {
  const { detected } = useWayfinderDetection()
  const [presence, setPresence] = useState<WayfinderPresenceData>(presenceCache ?? EMPTY_PRESENCE)
  const [loaded, setLoaded] = useState<boolean>(presenceCache !== null)

  useEffect(() => {
    let alive = true
    fetchPresence().then((v) => {
      if (alive) {
        setPresence(v)
        setLoaded(true)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  return {
    hasPlugin: detected || presence.hasActivity,
    hasActivity: presence.hasActivity,
    recordedGames: presence.recordedGames,
    eligibleForCardStats: presence.eligibleForCardStats,
    requiredGames: presence.requiredGames,
    loaded,
  }
}

export default usePluginPresence
