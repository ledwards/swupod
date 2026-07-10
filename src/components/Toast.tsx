'use client'

/**
 * Global toast primitive (Lobby V1, U5 — review finding: five lobby flows
 * need one shared mechanism, and no reusable toast existed).
 *
 * Rules:
 * - Toasts are dismissable and CLICK-TO-NAVIGATE only — never an automatic
 *   redirect that could interrupt in-progress work elsewhere.
 * - Mounted once at app root (ToastProvider in app/layout.tsx); call sites
 *   use useToast().
 * - Top-center, styled after the homepage's next-set promo banner. When a
 *   `.next-set-promo-banner` is on the page, the stack sits below it instead
 *   of overlapping. Up to 3 toasts show at once (newest below older); the
 *   rest queue until a slot frees up.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import './Toast.css'

export interface ToastOptions {
  text: string
  /** Optional action target — renders the toast as click-to-navigate. */
  href?: string
  actionLabel?: string
  kind?: 'info' | 'success' | 'danger'
  /** Auto-dismiss after ms; 0 keeps it until dismissed. Default 8000. */
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  // Auto-dismiss timers start only once a toast becomes VISIBLE, so queued
  // toasts don't expire while waiting for a slot.
  const scheduled = useRef(new Set<number>())
  // Banner-aware offset: px top for the stack when a promo banner is present.
  const [topOffset, setTopOffset] = useState<number | null>(null)
  const router = useRouter()

  const dismiss = useCallback((id: number) => {
    scheduled.current.delete(id)
    setToasts(current => current.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    setToasts(current => [...current, { ...options, id }])
  }, [])

  // Oldest first — newest renders below older ones; overflow queues.
  const visible = toasts.slice(0, MAX_VISIBLE)

  useEffect(() => {
    for (const toast of visible) {
      if (scheduled.current.has(toast.id)) continue
      const duration = toast.durationMs ?? 8000
      if (duration > 0) {
        scheduled.current.add(toast.id)
        setTimeout(() => dismiss(toast.id), duration)
      }
    }
  }, [visible, dismiss])

  // If the homepage promo banner is in the DOM, position the stack below it
  // instead of on top of it. Re-measured whenever the stack is showing.
  useEffect(() => {
    if (visible.length === 0) return
    const measure = () => {
      const banner = document.querySelector('.next-set-promo-banner')
      if (!banner) {
        setTopOffset(null)
        return
      }
      const bottom = banner.getBoundingClientRect().bottom
      // Banner scrolled out of view → fall back to the default top spacing.
      setTopOffset(bottom > 0 ? bottom + 8 : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
    }
  }, [visible.length])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {visible.length > 0 && (
        <div
          className="pt-toast-stack"
          role="status"
          aria-live="polite"
          style={topOffset != null ? { top: `${topOffset}px` } : undefined}
        >
          {visible.map(toast => (
            <div key={toast.id} className={`pt-toast pt-toast-${toast.kind ?? 'info'}`}>
              <div className="pt-toast-text">{toast.text}</div>
              {toast.href && (
                <button
                  type="button"
                  className="pt-toast-action"
                  onClick={() => {
                    dismiss(toast.id)
                    router.push(toast.href!)
                  }}
                >
                  {toast.actionLabel ?? 'Open'}
                </button>
              )}
              <button
                type="button"
                className="pt-toast-dismiss"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
