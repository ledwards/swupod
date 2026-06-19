'use client'

import { useEffect, useState } from 'react'

/**
 * useWayfinderDetection — is the Wayfinder Companion extension installed, and is
 * it signed in?
 *
 * How the extension announces itself (verified across the Chrome / Firefox /
 * Safari builds — identical signals):
 *   - injects `<meta name="wayfinder-installed" content="true" data-icon-url=…>`
 *   - dispatches a `wayfinder:installed` DOM CustomEvent
 *   - postMessages `wayfinder:metadata` and `wayfinder:lobby-count`
 *   - stamps `data-logged-in="true|false"` on that meta and postMessages
 *     `wayfinder:auth-state` { loggedIn } — whether the Companion ITSELF is
 *     signed in (separate from any PTP/Discord session). ABSENT until the
 *     extension's async storage read resolves, and on builds that predate it —
 *     so we report `pluginLoggedIn = null` (unknown) and callers must not nag.
 *
 * The presence/metadata/lobby signals fire on the PLAY pages; the marker +
 * auth-state fire on every PTP page (content-ptp-detect runs site-wide). We
 * detect two ways:
 *   1. LIVE — read the meta tag / listen for the event + postMessages.
 *   2. REMEMBERED — when we ever detect it live, stamp localStorage; pages where
 *      the extension is slow/absent to inject trust a recent stamp. On an
 *      injectable page we self-heal: if no live signal arrives, clear the stamp.
 *      (Only PRESENCE is remembered — sign-in state is too volatile to cache, so
 *      `pluginLoggedIn` comes from live signals only.)
 *
 * `?wayfinder=1` / `?wayfinder=0` force presence and `?wflogin=1` / `?wflogin=0`
 * force sign-in state, for local QA (the extension only matches localhost:3000,
 * so it can't be detected on other dev ports).
 */
export interface WayfinderDetection {
  detected: boolean
  iconUrl: string | null
  /** Signed in to the Companion extension itself (NOT a PTP/Discord session).
   *  `null` = unknown — no signal yet, or an older build that predates it.
   *  Treat null as "don't nag". */
  pluginLoggedIn: boolean | null
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
  const [pluginLoggedIn, setPluginLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    // QA overrides: ?wayfinder=1/0 forces presence; ?wflogin=1/0 forces sign-in.
    const params = new URLSearchParams(window.location.search)
    const forcedLogin = params.get('wflogin')
    if (forcedLogin === '1' || forcedLogin === 'true') setPluginLoggedIn(true)
    else if (forcedLogin === '0' || forcedLogin === 'false') setPluginLoggedIn(false)
    const forced = params.get('wayfinder')
    if (forced === '1' || forced === 'true') { setDetected(true); stamp(); return }
    if (forced === '0' || forced === 'false') { setDetected(false); clearStamp(); return }

    let liveSeen = false
    const markLive = (icon?: string | null) => {
      liveSeen = true
      setDetected(true)
      if (icon) setIconUrl(icon)
      stamp()
    }
    // The marker may carry sign-in state. Absent → leave as-is (unknown until a
    // live signal arrives); never downgrade a known value to null.
    const applyLoginAttr = (meta: HTMLMetaElement) => {
      const li = meta.dataset.loggedIn
      if (li === 'true') setPluginLoggedIn(true)
      else if (li === 'false') setPluginLoggedIn(false)
    }
    const readMeta = (): boolean => {
      const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
      if (meta) { markLive(meta.dataset.iconUrl || null); applyLoginAttr(meta); return true }
      return false
    }

    // 1. LIVE signals.
    const hadMeta = readMeta()
    const onInstalled = () => { if (!readMeta()) markLive() }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return
      const t = e.data?.type
      if (t === 'wayfinder:installed' || t === 'wayfinder:metadata' || t === 'wayfinder:lobby-count') markLive()
      else if (t === 'wayfinder:auth-state') { markLive(); setPluginLoggedIn(Boolean(e.data.loggedIn)) }
    }
    document.addEventListener('wayfinder:installed', onInstalled)
    window.addEventListener('message', onMessage)

    // 2. REMEMBERED — trust a recent stamp on pages the extension can't inject into.
    const injectable = INJECTABLE_RE.test(window.location.pathname)
    if (!hadMeta && !injectable && rememberedRecently()) setDetected(true)

    // 3. SELF-HEAL — on an injectable page, the marker should appear fast. If it
    //    hasn't after a grace window, the extension isn't installed: drop the
    //    stamp and the (possibly remembered) detected state.
    const timer = window.setTimeout(() => {
      if (liveSeen) return
      if (readMeta()) return
      if (injectable) { clearStamp(); setDetected(false) }
    }, 1500)

    return () => {
      document.removeEventListener('wayfinder:installed', onInstalled)
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }
  }, [])

  return { detected, iconUrl, pluginLoggedIn }
}

export default useWayfinderDetection
