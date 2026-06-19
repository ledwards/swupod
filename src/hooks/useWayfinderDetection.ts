'use client'

import { useEffect, useState } from 'react'

/**
 * useWayfinderDetection — is the Wayfinder Companion extension installed?
 *
 * How the extension announces itself (verified across the Chrome / Firefox /
 * Safari builds — identical signals):
 *   - injects `<meta name="wayfinder-installed" content="true" data-icon-url=…>`
 *   - dispatches a `wayfinder:installed` DOM CustomEvent
 *   - postMessages `wayfinder:metadata` and `wayfinder:lobby-count`
 * All of these only fire on pages the content script runs on — today that is the
 * PLAY pages (the pool deck-play page, plus pack-wars / pack-blitz play) on
 * protectthepod.com, protectthepod.net and localhost:3000. It does NOT run on
 * /me, the homepage, etc.
 *
 * So we detect two ways:
 *   1. LIVE — read the meta tag / listen for the event + postMessages. 100%
 *      reliable on any page the extension injects into.
 *   2. REMEMBERED — when we ever detect it live, we stamp localStorage; other
 *      pages (where the extension doesn't inject) trust a recent stamp. On an
 *      injectable page we self-heal: if no live signal arrives, the extension is
 *      gone, so we clear the stamp.
 *
 * `?wayfinder=1` / `?wayfinder=0` force the state for local QA (the extension
 * only matches localhost:3000, so it can't be detected on other dev ports).
 *
 * For fully-live detection everywhere (not just remembered), the extension needs
 * to inject its marker on all protectthepod.com pages — see
 * docs/WAYFINDER_PLUGIN_DETECTION.md.
 */
export interface WayfinderDetection {
  detected: boolean
  iconUrl: string | null
  settled: boolean
}

const STAMP_KEY = 'wf_companion_seen_at'
const REMEMBER_MS = 1000 * 60 * 60 * 24 * 45 // 45 days

// URLs the extension's content script injects into (must match its manifest).
const INJECTABLE_RE = /\/(pool\/[^/]+\/deck\/play|formats\/(?:pack-wars|pack-blitz)\/[^/]+\/play)/

function stamp(): void {
  try { localStorage.setItem(STAMP_KEY, String(Date.now())) } catch { /* private mode */ }
}
function clearStamp(): void {
  try { localStorage.removeItem(STAMP_KEY) } catch { /* private mode */ }
}
function rememberedRecently(): boolean {
  try {
    const seen = Number(localStorage.getItem(STAMP_KEY) || 0)
    return seen > 0 && Date.now() - seen < REMEMBER_MS
  } catch {
    return false
  }
}

export function useWayfinderDetection(): WayfinderDetection {
  const [detected, setDetected] = useState(false)
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    // QA override: ?wayfinder=1 / ?wayfinder=0
    const forced = new URLSearchParams(window.location.search).get('wayfinder')
    if (forced === '1' || forced === 'true') { setDetected(true); setSettled(true); stamp(); return }
    if (forced === '0' || forced === 'false') { setDetected(false); setSettled(true); clearStamp(); return }

    let liveSeen = false
    const markLive = (icon?: string | null) => {
      liveSeen = true
      setDetected(true)
      setSettled(true)
      if (icon) setIconUrl(icon)
      stamp()
    }
    const readMeta = (): boolean => {
      const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
      if (meta) { markLive(meta.dataset.iconUrl || null); return true }
      return false
    }

    // 1. LIVE signals.
    const hadMeta = readMeta()
    const onInstalled = () => { if (!readMeta()) markLive() }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return
      const t = e.data?.type
      if (t === 'wayfinder:installed' || t === 'wayfinder:metadata' || t === 'wayfinder:lobby-count') markLive()
    }
    document.addEventListener('wayfinder:installed', onInstalled)
    window.addEventListener('message', onMessage)

    // 2. REMEMBERED — trust a recent stamp on pages the extension can't inject into.
    const injectable = INJECTABLE_RE.test(window.location.pathname)
    if (!hadMeta && !injectable) {
      if (rememberedRecently()) setDetected(true)
      setSettled(true)
    }

    // 3. SELF-HEAL — on an injectable page, the marker should appear fast. If it
    //    hasn't after a grace window, the extension isn't installed: drop the
    //    stamp and the (possibly remembered) detected state.
    const timer = window.setTimeout(() => {
      if (liveSeen) { setSettled(true); return }
      if (readMeta()) { setSettled(true); return }
      if (injectable) { clearStamp(); setDetected(false) }
      setSettled(true)
    }, 1500)

    return () => {
      document.removeEventListener('wayfinder:installed', onInstalled)
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }
  }, [])

  return { detected, iconUrl, settled }
}

export default useWayfinderDetection
