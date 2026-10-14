'use client'

import { useEffect, useState } from 'react'

export interface StatsJsonState<T> {
  data: T | null
  loading: boolean
  error: boolean
}

/**
 * GET a stats endpoint and unwrap its `{ data }` envelope. A null url skips the
 * request (e.g. a cohort the viewer can't see). Responses for a url that has
 * since changed are dropped, so a slow previous set never overwrites the next.
 */
export function useStatsJson<T>(url: string | null): StatsJsonState<T> {
  const [state, setState] = useState<StatsJsonState<T>>({ data: null, loading: Boolean(url), error: false })

  useEffect(() => {
    if (!url) { setState({ data: null, loading: false, error: false }); return }
    let cancelled = false
    setState((prev) => ({ data: prev.data, loading: true, error: false }))
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => { if (!cancelled) setState({ data: (body && body.data ? body.data : body) as T, loading: false, error: false }) })
      .catch(() => { if (!cancelled) setState({ data: null, loading: false, error: true }) })
    return () => { cancelled = true }
  }, [url])

  return state
}

/** Build a stats url from a path and params, skipping empty values. */
export function statsUrl(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  return `${path}?${search.toString()}`
}
