import { useAuth } from '../contexts/AuthContext'
import { hasEntryAccess } from '../services/entry/access'
import { useCallback, useEffect, useRef } from 'react'

/** Ctrl previews immediately; ordinary hover must remain on the card for the delay. */
export function useDelayedCardHover(delay = 1000, legacyDelay = 500) {
  const { user } = useAuth()
  const alpha = hasEntryAccess(user)
  const effectiveDelay = alpha ? delay : legacyDelay
  const pending = useRef<{ show: () => void; hide: () => void; elapsed: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stop = useCallback(() => {
    clearTimeout(timer.current)
    pending.current?.hide()
    pending.current = null
  }, [])
  const start = useCallback((show: () => void, hide: () => void, control = false) => {
    stop()
    pending.current = { show, hide, elapsed: false }
    if (alpha && control) show()
    timer.current = setTimeout(() => {
      if (pending.current) { pending.current.elapsed = true; pending.current.show() }
    }, effectiveDelay)
  }, [effectiveDelay, alpha, stop])
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (alpha && e.key === 'Control') pending.current?.show(); if (e.key === 'Escape') stop() }
    const up = (e: KeyboardEvent) => { if (alpha && e.key === 'Control' && !pending.current?.elapsed) pending.current?.hide() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', stop)
    window.addEventListener('scroll', stop, true)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', stop)
      window.removeEventListener('scroll', stop, true)
    }
  }, [alpha, stop])
  return { start, stop }
}
