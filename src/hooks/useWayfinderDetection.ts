'use client'

import { useEffect, useState } from 'react'
import { PRACTICE_LIVE_CAPABILITY, parseCapabilities } from '../utils/wayfinderCapabilities'

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
 * `?wayfinder=1` / `?wayfinder=0` force presence, `?wflogin=1` / `?wflogin=0`
 * force sign-in state, and `?wfcap=ready|old|none` forces the practice-live
 * capability tier — for local QA (the extension only matches localhost:3000, so
 * it can't be detected on other dev ports).
 */
export interface WayfinderDetection {
  detected: boolean
  iconUrl: string | null
  settled: boolean
  /** Signed in to the Companion extension itself (NOT a PTP/Discord session).
   *  `null` = unknown — no signal yet, or an older build that predates it.
   *  Treat null as "don't nag". */
  pluginLoggedIn: boolean | null
  /** Capabilities the Companion advertised (e.g. PRACTICE_LIVE_CAPABILITY).
   *  Empty for older builds that announce none — treated as "needs update". */
  capabilities: string[]
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
  const [pluginLoggedIn, setPluginLoggedIn] = useState<boolean | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])

  useEffect(() => {
    // QA overrides: ?wayfinder=1/0 forces presence; ?wflogin=1/0 forces sign-in.
    const params = new URLSearchParams(window.location.search)
    const forcedLogin = params.get('wflogin')
    if (forcedLogin === '1' || forcedLogin === 'true') setPluginLoggedIn(true)
    else if (forcedLogin === '0' || forcedLogin === 'false') setPluginLoggedIn(false)
    // ?wfcap=ready|old|none forces the practice-live capability tier for local QA.
    const forcedCap = params.get('wfcap')
    if (forcedCap === 'ready') { setDetected(true); setSettled(true); setCapabilities([PRACTICE_LIVE_CAPABILITY]); stamp(); return }
    if (forcedCap === 'old') { setDetected(true); setSettled(true); setCapabilities([]); stamp(); return }
    if (forcedCap === 'none') { setDetected(false); setSettled(true); setCapabilities([]); clearStamp(); return }
    const forced = params.get('wayfinder')
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
    // The marker may carry sign-in state. Absent → leave as-is (unknown until a
    // live signal arrives); never downgrade a known value to null.
    const applyLoginAttr = (meta: HTMLMetaElement) => {
      const li = meta.dataset.loggedIn
      if (li === 'true') setPluginLoggedIn(true)
      else if (li === 'false') setPluginLoggedIn(false)
    }
    // The marker may carry a comma-separated capability list.
    const applyCapabilities = (meta: HTMLMetaElement) => {
      if (meta.dataset.capabilities !== undefined) setCapabilities(parseCapabilities(meta.dataset.capabilities))
    }
    const readMeta = (): boolean => {
      const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
      if (meta) { markLive(meta.dataset.iconUrl || null); applyLoginAttr(meta); applyCapabilities(meta); return true }
      return false
    }

    // 1. LIVE signals.
    const hadMeta = readMeta()
    const onInstalled = () => { if (!readMeta()) markLive() }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return
      const t = e.data?.type
      if (t === 'wayfinder:installed' || t === 'wayfinder:metadata' || t === 'wayfinder:lobby-count') {
        markLive()
        if (t === 'wayfinder:metadata' && e.data?.capabilities !== undefined) setCapabilities(parseCapabilities(e.data.capabilities))
      }
      else if (t === 'wayfinder:auth-state') { markLive(); setPluginLoggedIn(Boolean(e.data.loggedIn)) }
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

  return { detected, iconUrl, settled, pluginLoggedIn, capabilities }
}

export default useWayfinderDetection
