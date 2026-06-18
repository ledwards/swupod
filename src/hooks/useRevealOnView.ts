'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * useRevealOnView — fire a one-shot "now visible" flag the first time an element
 * scrolls into the viewport (and immediately if it's already on screen at load).
 * Used to trigger entrance animations (e.g. the conic-gradient pies sweeping in)
 * the same way the /stats recharts pies animate on mount.
 *
 * Falls back to revealed=true when IntersectionObserver is unavailable.
 */
export function useRevealOnView<T extends HTMLElement = HTMLDivElement>(
  opts?: { rootMargin?: string; threshold?: number },
) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setInView(true); obs.disconnect(); break }
        }
      },
      { rootMargin: opts?.rootMargin ?? '0px 0px -10% 0px', threshold: opts?.threshold ?? 0.2 },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ref, inView }
}

export default useRevealOnView
