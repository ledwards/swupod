'use client'

import { useEffect, useState } from 'react'

/**
 * useWayfinderDetection — is the Wayfinder Companion extension installed?
 *
 * The extension's content script injects `<meta name="wayfinder-installed">`
 * (optionally carrying `data-icon-url`) and fires a `wayfinder:installed` event.
 * This hook reads the meta tag, listens for the event, and polls briefly in
 * case the content script loads after React mounts. Works on any browser/OS
 * the extension supports — detection is pure DOM, not browser-gated.
 *
 * Returns `{ detected, iconUrl }`. Previously this logic was copy-pasted inline
 * in every play page; centralise it here so /me and the play flows agree.
 */
export interface WayfinderDetection {
  detected: boolean
  iconUrl: string | null
}

export function useWayfinderDetection(): WayfinderDetection {
  const [detected, setDetected] = useState(false)
  const [iconUrl, setIconUrl] = useState<string | null>(null)

  useEffect(() => {
    const read = (): boolean => {
      const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
      if (meta) {
        setDetected(true)
        if (meta.dataset.iconUrl) setIconUrl(meta.dataset.iconUrl)
        return true
      }
      return false
    }

    if (read()) return

    // Content script may inject after mount — listen for its event...
    const onInstalled = () => read()
    document.addEventListener('wayfinder:installed', onInstalled)
    // ...and poll briefly in case the event fired before we subscribed.
    const timer = setTimeout(read, 1000)

    return () => {
      document.removeEventListener('wayfinder:installed', onInstalled)
      clearTimeout(timer)
    }
  }, [])

  return { detected, iconUrl }
}

export default useWayfinderDetection
