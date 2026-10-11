'use client'
import {useEffect, useState} from 'react'

// The play-home bundle moves between its pages with history.pushState/replaceState,
// which Next's usePathname() never sees (it keeps reporting '/'). Wrap both once so
// the header can follow the real location; the event fires after the call returns.
export const LOCATION_EVENT = 'ptp:locationchange'
export function watchHistory() {
  const w = window as Window & {__ptpHistoryWatched?: boolean}
  if (w.__ptpHistoryWatched) return
  w.__ptpHistoryWatched = true
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args)
      queueMicrotask(() => window.dispatchEvent(new Event(LOCATION_EVENT)))
      return result
    }
  }
}

/** The browser's real path, following the bundle's own navigation. `initial` is used until mounted. */
export function useRealPathname(initial: string) {
  const [path, setPath] = useState(initial)
  useEffect(() => {
    watchHistory()
    const sync = () => setPath(window.location.pathname)
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener(LOCATION_EVENT, sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener(LOCATION_EVENT, sync) }
  }, [])
  return path
}
