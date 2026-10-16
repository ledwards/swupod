'use client'

import { useEffect, useState } from 'react'

export interface CachedJsonState<T> {
  data: T | null
  loading: boolean
  error: boolean
}

// Module-level, so switching tabs back to a set never refetches its (DB-heavy) data.
const cache = new Map<string, unknown>()

/**
 * GET a JSON endpoint once per url for the life of the page and unwrap its
 * `{ data }` envelope. A null url skips the request. Responses for a url that
 * has since changed are dropped.
 */
export function useCachedJson<T>(url: string | null): CachedJsonState<T> {
  const [state, setState] = useState<CachedJsonState<T>>(() => {
    const hit = url ? cache.get(url) : undefined
    return { data: (hit as T) ?? null, loading: Boolean(url) && hit === undefined, error: false }
  })

  useEffect(() => {
    if (!url) { setState({ data: null, loading: false, error: false }); return }
    const hit = cache.get(url)
    if (hit !== undefined) { setState({ data: hit as T, loading: false, error: false }); return }
    let cancelled = false
    setState({ data: null, loading: true, error: false })
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => {
        const data = (body && body.data ? body.data : body) as T
        cache.set(url, data)
        if (!cancelled) setState({ data, loading: false, error: false })
      })
      .catch(() => { if (!cancelled) setState({ data: null, loading: false, error: true }) })
    return () => { cancelled = true }
  }, [url])

  return state
}
