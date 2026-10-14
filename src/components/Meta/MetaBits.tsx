'use client'

import type { ReactNode } from 'react'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import { PATREON_URL } from '@/src/utils/membership'

/** Section header stack: heading, subtitle, then content. */
export function MetaSection({ title, subtitle, actions, children, panel = false, className = '' }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  panel?: boolean
  className?: string
}) {
  return (
    <section className={`meta-section${panel ? ' meta-panel' : ''} ${className}`.trim()}>
      <div className="meta-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="meta-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** Square crop of a leader's portrait art (canonical crop lives in YourStats.css). */
export function MetaArt({ src, alt = '', size }: { src: string | null | undefined; alt?: string; size?: number }) {
  return (
    <span className="meta-art" style={size ? { width: size, height: size } : undefined}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : null}
    </span>
  )
}

/** Small full-card thumbnail for table rows: whole card, never cropped. */
export function MetaCardThumb({ src }: { src: string | null | undefined }) {
  return <span className="meta-card-thumb">{src ? <img src={src} alt="" loading="lazy" /> : null}</span>
}

export function MetaPending({ kind = 'row', count = 6 }: { kind?: 'text' | 'row' | 'card' | 'control'; count?: number }) {
  return <ContentSkeleton kind={kind} count={count} />
}

export function MetaEmpty({ children }: { children: ReactNode }) {
  return <p className="meta-empty">{children}</p>
}

/** Cohort key shared by the leader tiles and the pick dot plot. */
export function CohortLegend({ showTop, showYou }: { showTop: boolean; showYou: boolean }) {
  return (
    <div className="meta-legend" aria-label="Legend">
      <span><i className="meta-swatch meta-swatch--all" />Everyone</span>
      {showTop && <span><i className="meta-swatch meta-swatch--top" />Top players</span>}
      {showYou && <span><i className="meta-swatch meta-swatch--you" />You</span>}
    </div>
  )
}

export function TopPlayersPitch() {
  return (
    <p className="meta-pitch">
      Friends of the Pod also see how top players draft and build. <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Become a Friend of the Pod</a>
    </p>
  )
}

export const pct = (n: number | null | undefined, digits = 1) => (n == null ? '–' : `${n.toFixed(digits)}%`)
export const fmt = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString())
