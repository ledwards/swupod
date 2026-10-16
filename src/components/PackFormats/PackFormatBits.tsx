'use client'
import type { MouseEvent } from 'react'
import Card from '../Card'
import AspectIcon from '../AspectIcon'
import { isRenderableMatchId } from '../../utils/deckRecord'
import type { PackCard } from './packFormats'

/** The legacy play pages' copy and download glyphs, unchanged. */
export const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)
export const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
)

/** A leader or base: the card, then its aspects and name. */
export function PackCardTile({ card, kind, active, disabled, onClick, onMouseEnter, onMouseLeave, onTouchStart, onTouchEnd }: {
  card: PackCard
  kind: 'leader' | 'base'
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: () => void
  onTouchStart?: () => void
  onTouchEnd?: () => void
}) {
  return (
    <div className="pfx-card">
      <Card
        card={{ ...card, ...(kind === 'leader' ? { isLeader: true } : { isBase: true }) }}
        {...(active !== undefined ? { active } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
        {...(onClick ? { onClick } : {})}
        {...(onMouseEnter ? { onMouseEnter } : {})}
        {...(onMouseLeave ? { onMouseLeave } : {})}
        {...(onTouchStart ? { onTouchStart } : {})}
        {...(onTouchEnd ? { onTouchEnd } : {})}
      />
      <span className="pfx-card-name">
        {(card.aspects ?? []).map((a, i) => <AspectIcon key={`${a}-${i}`} aspect={a} size="sm"/>)}
        <span>{card.name}</span>
      </span>
      {card.subtitle && <span className="pfx-meta">{card.subtitle}</span>}
    </div>
  )
}

/** The pool's W/L/D record with its Wayfinder match links, as the legacy play page shows it. */
export function RecordRow({ wins, losses, draws, matchIds, bestOf }: { wins: number; losses: number; draws: number; matchIds: string[]; bestOf?: boolean }) {
  const played = wins + losses + draws > 0
  if (!played && !bestOf) return null
  const wayfinder = process.env['NEXT_PUBLIC_WAYFINDER_URL'] ?? 'https://plugin.wayfinder.news'
  // Drop synthetic placeholders (e.g. "manual-recover-g2") that have no match page.
  const links = matchIds.filter(isRenderableMatchId)
  return (
    <div className="pfx-record" aria-label="Record">
      {played && <span className="pfx-chip">Record {wins}W {losses}L {draws}D</span>}
      {bestOf && <span className="pfx-chip">Best of 3</span>}
      {links.map((id, i) => <a key={id} href={`${wayfinder}/matches/${id}`} target="_blank" rel="noopener noreferrer">Match {i + 1}</a>)}
    </div>
  )
}
