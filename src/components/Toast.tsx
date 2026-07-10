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
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
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

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const router = useRouter()

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    setToasts(current => [...current.slice(-3), { ...options, id }])
    const duration = options.durationMs ?? 8000
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
  }, [dismiss])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="pt-toast-stack" role="status" aria-live="polite">
          {toasts.map(toast => (
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
