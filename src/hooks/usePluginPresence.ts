'use client'

import { useEffect, useState } from 'react'
import { useWayfinderDetection } from './useWayfinderDetection'

// Fetch the server presence signal once per page load and share it across every
// PluginCTA instance (module-level cache + in-flight de-dup so N CTAs = 1 fetch).
let activityCache: boolean | null = null
let activityInFlight: Promise<boolean> | null = null

function fetchActivity(): Promise<boolean> {
  if (activityCache !== null) return Promise.resolve(activityCache)
  if (!activityInFlight) {
    activityInFlight = fetch('/api/me/wayfinder-presence', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        activityCache = Boolean(b?.data?.hasActivity)
        return activityCache
      })
      .catch(() => {
        activityCache = false
        return false
      })
  }
  return activityInFlight
}

export interface PluginPresence {
  /** Has the Wayfinder Companion — live-detected OR proven by recorded PTP games. */
  hasPlugin: boolean
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
  const [hasActivity, setHasActivity] = useState<boolean>(activityCache ?? false)

  useEffect(() => {
    let alive = true
    fetchActivity().then((v) => {
      if (alive) setHasActivity(v)
    })
    return () => {
      alive = false
    }
  }, [])

  return { hasPlugin: detected || hasActivity }
}

export default usePluginPresence
