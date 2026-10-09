"use client"

import { useState, type ReactNode } from 'react'
import { getPackArtUrl } from '../../utils/packArt'

/** One line item on set key art: title, muted meta, action(s). The `.history-item--art` treatment, one line tall. */
export function ArtRow({ setCode, title, meta, children }: { setCode: string; title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  const art = getPackArtUrl(setCode)
  return (
    <div className="sp-row" style={art ? { backgroundImage: `url("${art}")` } : undefined}>
      <strong>{title}</strong>
      {meta ? <small>{meta}</small> : null}
      {children ? <span className="sp-row-actions">{children}</span> : null}
    </div>
  )
}

/** Shows the first `limit` rows; the rest sit behind a bottom-right "N more" control. */
export function ArtRows<T>({ items, limit = 3, render, keyOf }: { items: T[]; limit?: number; render: (item: T) => ReactNode; keyOf: (item: T) => string }) {
  const [open, setOpen] = useState(false)
  const hidden = items.length - limit
  const shown = open || hidden <= 0 ? items : items.slice(0, limit)
  return (
    <div className="sp-rows">
      {shown.map(item => <div key={keyOf(item)} className="sp-rows-item">{render(item)}</div>)}
      {hidden > 0 && (
        <div className="sp-rows-more">
          <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? 'Show less' : `${hidden} more`}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}

export const UNBUILT_POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Days left before an unbuilt pool drops off the landing page. */
export function daysLeft(createdAt: string | null | undefined, now = Date.now()): number | null {
  if (!createdAt) return null
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.ceil((t + UNBUILT_POOL_TTL_MS - now) / 86400000))
}

export const isFresh = (createdAt: string | null | undefined, now = Date.now()) => {
  if (!createdAt) return true
  const t = Date.parse(createdAt)
  return Number.isNaN(t) || now - t < UNBUILT_POOL_TTL_MS
}
