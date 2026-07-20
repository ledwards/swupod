'use client'

/**
 * Casual-intent capability handshake (review finding / release-skew guard):
 * "Companion detected" is NOT enough — a stale extension silently drops
 * unknown intents and a one-click button would spin dead. The U6 extension
 * advertises casual support via `data-casual-intents` on the detection meta
 * tag; only then does the match page dispatch casual intents.
 */
import { useEffect, useState } from 'react'
import { useWayfinderDetection } from './useWayfinderDetection'

export function useCompanionCapability(): { detected: boolean; casualCapable: boolean; settled: boolean } {
  const { detected, settled } = useWayfinderDetection()
  const [casualCapable, setCasualCapable] = useState(false)

  useEffect(() => {
    if (!detected) {
      setCasualCapable(false)
      return
    }
    const read = (): void => {
      const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
      setCasualCapable(meta?.dataset.casualIntents === 'true')
    }
    read()
    // The extension may stamp the attribute after initial detection.
    const timer = setInterval(read, 2000)
    return () => clearInterval(timer)
  }, [detected])

  return { detected, casualCapable, settled }
}

export default useCompanionCapability
