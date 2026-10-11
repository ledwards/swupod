'use client'
import { useEffect, useRef, type ReactNode } from 'react'

/** A modal sheet over the pod page. Escape or the close button dismisses it. */
export default function Sheet({ title, onClose, children, narrow = false, aside }: { title: string; onClose: () => void; children: ReactNode; narrow?: boolean; aside?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; previous?.focus?.() }
  }, [onClose])
  return <div className="pod-sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={ref} className={`pod-sheet${narrow ? ' is-narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <section className="pod-pn pod-sheet-main">
        <div className="pod-sheet-head"><h2>{title}</h2><button type="button" className="pod-close" aria-label="Close" onClick={onClose}>×</button></div>
        {children}
      </section>
      {aside && <aside className="pod-aside">{aside}</aside>}
    </div>
  </div>
}
