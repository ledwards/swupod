'use client'

import { AspectIcon } from '@/src/components/AspectIcon'
import { MetaArt } from './MetaBits'

export interface LeaderTile {
  name: string
  imageUrl: string | null
  aspects: string[]
  /** Everyone's value: drawn as the dashed ghost when a top-player value exists. */
  value: number | null
  top: number | null
  you: number | null
  detail: string
}

/**
 * Leader art grid with one rate per leader. The bar overlays cohorts the way
 * the deck builder overlays deck on pool: everyone as a dashed ghost, top
 * players as the fill, and your own rate as a tick.
 */
export function LeaderTiles({ tiles, max, format }: { tiles: LeaderTile[]; max: number; format: (n: number) => string }) {
  const scale = (n: number) => `${Math.max(0, Math.min(100, (n / (max || 1)) * 100))}%`
  return (
    <div className="meta-leader-grid">
      {tiles.map((t) => {
        const hasTop = t.top != null
        return (
          <div className="meta-leader-tile" key={t.name}>
            <MetaArt src={t.imageUrl} alt={t.name} />
            <div className="meta-leader-name">
              <span>{t.name}</span>
              <span className="meta-aspects">{t.aspects.map((a) => <AspectIcon key={a} aspect={a} size="sm" />)}</span>
            </div>
            <div className="meta-leader-value">{t.value == null ? '–' : format(t.value)}</div>
            <span className="meta-track" aria-hidden="true">
              {hasTop && t.value != null && <span className="meta-track-ghost" style={{ width: scale(t.value) }} />}
              {(hasTop ? t.top : t.value) != null && <span className="meta-track-fill" style={{ width: scale((hasTop ? t.top : t.value) as number) }} />}
              {t.you != null && <span className="meta-track-you" style={{ left: scale(t.you) }} />}
            </span>
            <div className="meta-leader-detail">{t.detail}</div>
          </div>
        )
      })}
    </div>
  )
}
