'use client'

import type { CSSProperties, ReactNode } from 'react'
import { AspectIcon } from '@/src/components/AspectIcon'
import { RarityIcon } from '@/src/components/CardIcons'
import CostIcon from '@/src/components/CostIcon'

export interface ArtCard {
  cardName: string
  subtitle?: string | null
  imageUrl: string | null
  backImageUrl?: string | null
  hyperspaceImageUrl?: string | null
  hyperspaceBackImageUrl?: string | null
  cardType?: string | null
  aspects?: string[] | null
  rarity?: string | null
  cost?: number | null
}

export interface ArtListColumn<T> {
  key: string
  label: string
  title?: string
  /** Present when the column can be sorted. */
  sortable?: boolean
  render: (row: T) => ReactNode
}

// Where the illustration sits on each kind of card image (wayfinder-ios list rows).
// The art is also scaled up (meta.css) so the card frame never shows at the edges.
const ART_Y: Record<string, string> = { Unit: '28%', Leader: '22%', Event: '88%', Upgrade: '40%', Base: '45%' }

function artFor(card: ArtCard) {
  const isLeader = card.cardType === 'Leader'
  return {
    // Hyperspace printing first; leaders use the portrait unit side.
    src: isLeader
      ? card.hyperspaceBackImageUrl || card.backImageUrl || card.hyperspaceImageUrl || card.imageUrl
      : card.hyperspaceImageUrl || card.imageUrl,
    y: ART_Y[card.cardType || ''] || '30%',
  }
}

/**
 * Card list rows with the card's art as the row background, faded under the
 * name the way wayfinder-ios lists cards. Stat columns follow on the surface.
 */
export function CardArtList<T extends ArtCard>({ rows, columns, sortKey, sortDir, onSort, onSelect, rowKey, label }: {
  rows: T[]
  columns: ArtListColumn<T>[]
  sortKey: string
  sortDir: 'ascending' | 'descending'
  onSort: (key: string) => void
  onSelect?: (row: T) => void
  rowKey: (row: T) => string
  label: string
}) {
  const style = { '--mstats-cols': columns.length } as CSSProperties
  return (
    <div className="mstats-list-wrap">
      <div className="mstats-list" role="table" aria-label={label} style={style}>
        <div className="mstats-list-head" role="row">
          <span role="columnheader" className="mstats-list-card-head">Card</span>
          {columns.map((c) => (
            <span key={c.key} role="columnheader" title={c.title} aria-sort={c.sortable ? (sortKey === c.key ? sortDir : 'none') : undefined}>
              {c.sortable
                ? <button type="button" className={`mstats-sort${sortKey === c.key ? ' is-active' : ''}`} onClick={() => onSort(c.key)}>{c.label}</button>
                : c.label}
            </span>
          ))}
        </div>
        <div role="rowgroup" className="mstats-list-body">
          {rows.map((row) => {
            const art = artFor(row)
            const identity = (
              <>
                {art.src && <img className="mstats-list-art" src={art.src} alt="" loading="lazy" style={{ objectPosition: `center ${art.y}`, transformOrigin: `center ${art.y}` }} />}
                <span className="mstats-list-text">
                  <span className="mstats-list-name">{row.cardName}</span>
                  <span className="mstats-list-meta">
                    {row.cost != null && <CostIcon cost={row.cost} size={18} />}
                    {(row.aspects || []).map((a, i) => <AspectIcon key={`${a}-${i}`} aspect={a} size="xs" />)}
                    <RarityIcon rarity={row.rarity} size={15} />
                    {row.subtitle && <span className="mstats-list-sub">{row.subtitle}</span>}
                  </span>
                </span>
              </>
            )
            return (
              <div role="row" className="mstats-list-row" key={rowKey(row)}>
                {onSelect
                  ? <button type="button" role="cell" className="mstats-list-card" onClick={() => onSelect(row)} aria-label={`${row.cardName} details`}>{identity}</button>
                  : <span role="cell" className="mstats-list-card">{identity}</span>}
                {columns.map((c) => <span role="cell" key={c.key} className="mstats-list-cell">{c.render(row)}</span>)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
