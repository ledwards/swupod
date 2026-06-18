'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * useStickyTab — remember which tab a user last selected so a refresh or the
 * browser Back button returns them to it rather than the default.
 *
 * The active tab is mirrored into the URL query (`?tab=…`) via the History API
 * (no Next navigation / server re-render) AND into localStorage:
 *   - URL query  → survives refresh and is captured in the history entry, so
 *                  Back returns to the same tab.
 *   - localStorage → restores the last tab even when arriving without a query.
 *
 * Reusable for any tab group: pass the valid values, a default, and a unique
 * storage key (+ optional query param name if a page has more than one group).
 *
 *   const [tab, setTab] = useStickyTab(['a','b'] as const, 'a', { storageKey: 'me-tab' })
 */
export function useStickyTab<T extends string>(
  values: readonly T[],
  defaultValue: T,
  opts?: { param?: string; storageKey?: string },
): [T, (v: T) => void] {
  const param = opts?.param ?? 'tab'
  const storageKey = opts?.storageKey
  const isValid = (v: string | null | undefined): v is T => !!v && (values as readonly string[]).includes(v)

  // Always start from the default so server and first client render agree (no
  // hydration mismatch); the effect below adopts the stored/URL tab on mount.
  const [tab, setTab] = useState<T>(defaultValue)

  useEffect(() => {
    try {
      const fromUrl = new URL(window.location.href).searchParams.get(param)
      if (isValid(fromUrl)) { setTab(fromUrl); return }
      if (storageKey) {
        const stored = localStorage.getItem(storageKey)
        if (isValid(stored)) { setTab(stored); return }
      }
    } catch { /* SSR / blocked storage — keep default */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const select = useCallback((v: T) => {
    setTab(v)
    try {
      if (storageKey) localStorage.setItem(storageKey, v)
      const url = new URL(window.location.href)
      url.searchParams.set(param, v)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch { /* no-op */ }
  }, [param, storageKey])

  return [tab, select]
}

export default useStickyTab
