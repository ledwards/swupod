'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * useStickyTab — remember which tab a user last selected so a refresh, a deep
 * link, or the browser Back button returns them to it rather than the default.
 *
 * The active tab is mirrored into the URL **hash** (`#meta`) via the History API
 * (no Next navigation / server re-render) and, optionally, into localStorage:
 *   - URL hash     → deep-linkable and survives refresh. The hash is never sent
 *                    to the server, so the default-seeded first render can't
 *                    cause a hydration mismatch.
 *   - localStorage → restores the last tab even when arriving without a hash.
 *
 * A page owns exactly one hash, so a secondary tab group (a subtab) passes
 * `url: false` to persist via localStorage only and leave the hash to the
 * page's primary group.
 *
 * Reusable for any tab group: pass the valid values, a default, and (optionally)
 * a storage key.
 *
 *   const [tab, setTab] = useStickyTab(['a','b'] as const, 'a', { storageKey: 'me-tab' })
 *   // secondary subtab — storage only, leaves the hash alone:
 *   const [sub, setSub] = useStickyTab(['x','y'] as const, 'x', { url: false, storageKey: 'sub' })
 */
export function useStickyTab<T extends string>(
  values: readonly T[],
  defaultValue: T,
  opts?: { storageKey?: string; url?: boolean; legacyParam?: string },
): [T, (v: T) => void] {
  const storageKey = opts?.storageKey
  const useUrl = opts?.url ?? true
  const legacyParam = opts?.legacyParam
  const isValid = (v: string | null | undefined): v is T => !!v && (values as readonly string[]).includes(v)

  // Always start from the default so server and first client render agree (no
  // hydration mismatch); the effect below adopts the hash/stored tab on mount.
  const [tab, setTab] = useState<T>(defaultValue)

  useEffect(() => {
    try {
      if (useUrl) {
        const fromHash = window.location.hash.slice(1)
        if (isValid(fromHash)) { setTab(fromHash); return }
        // Back-compat: upgrade an old `?param=value` deep link to `#value`, so
        // existing bookmarks (e.g. /me?tab=meta) keep landing on the right tab.
        if (legacyParam) {
          const url = new URL(window.location.href)
          const fromQuery = url.searchParams.get(legacyParam)
          if (isValid(fromQuery)) {
            url.searchParams.delete(legacyParam)
            url.hash = fromQuery
            window.history.replaceState(window.history.state, '', url.toString())
            setTab(fromQuery)
            return
          }
        }
      }
      if (storageKey) {
        const stored = localStorage.getItem(storageKey)
        if (isValid(stored)) { setTab(stored); return }
      }
    } catch { /* SSR / blocked storage — keep default */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Adopt external hash changes (manual URL edit, an anchor link, browser nav).
  // Our own writes go through replaceState (below), which does NOT fire
  // hashchange — so this never echoes our own updates back into a loop.
  useEffect(() => {
    if (!useUrl) return
    const onHashChange = () => {
      const fromHash = window.location.hash.slice(1)
      if (isValid(fromHash)) setTab((prev) => (prev === fromHash ? prev : fromHash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useUrl])

  const select = useCallback((v: T) => {
    setTab(v)
    try {
      if (storageKey) localStorage.setItem(storageKey, v)
      if (useUrl) {
        // replaceState (not `location.hash =`) so a tab click doesn't spam the
        // history stack — Back returns to the prior page, not through each tab.
        const url = new URL(window.location.href)
        url.hash = v
        window.history.replaceState(window.history.state, '', url.toString())
      }
    } catch { /* no-op */ }
  }, [storageKey, useUrl])

  return [tab, select]
}

export default useStickyTab
