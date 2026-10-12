'use client'
import { useEffect, useState } from 'react'

/**
 * Keeps something mounted long enough to fade out. `mounted` says whether to
 * render; `leaving` is true during the fade-out, for a class that plays it.
 * Pair with the `.fade-presence` / `.is-leaving` classes (draft-log.css), which
 * honour prefers-reduced-motion.
 */
export function useFadePresence(open: boolean, ms = 140): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) { setMounted(true); setLeaving(false); return }
    if (!mounted) return
    setLeaving(true)
    const id = setTimeout(() => { setMounted(false); setLeaving(false) }, ms)
    return () => clearTimeout(id)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, leaving }
}
