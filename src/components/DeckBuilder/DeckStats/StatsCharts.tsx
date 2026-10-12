/**
 * Chart pieces for deck stats. Every chart draws the primary side (deck or
 * sideboard) solid over a dashed outline for the whole pool.
 */

import type { ReactNode } from 'react'
import { AspectIcon } from '../../AspectIcon'
import { Button } from '../../Button'
import { aspectPairings, NEUTRAL, type AspectRow, type CurveBucket, type OverlayCount, type StatsCard } from '../../../services/deckStats'

export const KIND_LABELS: Record<string, string> = { ground: 'Ground unit', space: 'Space unit', event: 'Event', upgrade: 'Upgrade' }
export const KIND_ORDER = ['ground', 'space', 'event', 'upgrade'] as const

export function StatsPanel({ label, badge, children }: { label: string; badge?: string; children: ReactNode }) {
  return (
    <section className="deck-stats-module" aria-label={label}>
      <h4 className="deck-stats-module-label">{label}{badge && <span className="deck-stats-set-badge">{badge}</span>}</h4>
      {children}
    </section>
  )
}

export function OverlayRow({ label, primary, pool, max, fill, extra }: {
  label: ReactNode; primary: number; pool: number; max: number; fill?: string | undefined; extra?: ReactNode
}) {
  const pct = (n: number) => `${max ? (n / max) * 100 : 0}%`
  return (
    <div className="deck-stats-row">
      <span className="deck-stats-row-label">{label}{extra}</span>
      <span className="deck-stats-track" aria-hidden="true">
        <span className="deck-stats-ghost" style={{ width: pct(pool) }} />
        <span className="deck-stats-fill" style={{ width: pct(primary), background: fill }} />
      </span>
      <span className="deck-stats-count"><b>{primary}</b> / {pool}</span>
    </div>
  )
}

export function Legend({ primaryLabel, children }: { primaryLabel: string; children?: ReactNode }) {
  return (
    <div className="deck-stats-legend">
      <span><i className="deck-stats-swatch" />{primaryLabel}</span>
      <span><i className="deck-stats-swatch deck-stats-swatch--ghost" />Pool</span>
      {children}
    </div>
  )
}

const ASPECT_FILL: Record<string, string> = {
  Vigilance: '#4A90E2', Command: '#27AE60', Aggression: '#E74C3C', Cunning: '#F1C40F', Villainy: '#555', Heroism: '#f0f0f0', [NEUTRAL]: '#888',
}

export function AspectBars({ rows, primary, pool, primaryLabel, openAspect, onToggle, showPenalty }: {
  rows: AspectRow[]; primary: StatsCard[]; pool: StatsCard[]; primaryLabel: string
  openAspect: string | null; onToggle: (aspect: string) => void; showPenalty: boolean
}) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.primary, r.pool)))
  const providedKeys = new Set(rows.filter(r => r.provided).map(r => r.key))
  return (
    <StatsPanel label="Aspects">
      <div className="deck-stats-rows">
        {rows.map(row => {
          const expandable = row.key !== NEUTRAL
          const open = expandable && openAspect === row.key
          const label = <><span className="deck-stats-caret" aria-hidden="true">{expandable ? (open ? '▾' : '▸') : ''}</span>{expandable ? <AspectIcon aspect={row.key} size="md" /> : <span className="deck-stats-icon-spacer" />}{row.key}</>
          const extra = <>{row.provided && <span className="deck-stats-provided" title="From your leader or base">✓</span>}{showPenalty && row.penalized && <span className="deck-stats-penalty" title="Off-aspect: +2 cost per missing icon">+2</span>}</>
          const bar = <OverlayRow label={label} extra={extra} primary={row.primary} pool={row.pool} max={max} fill={ASPECT_FILL[row.key]} />
          if (!expandable) return <div key={row.key}>{bar}</div>
          const pairs = open ? aspectPairings(row.key, primary, pool) : []
          const pairMax = Math.max(1, ...pairs.map(p => p.pool))
          return (
            <div key={row.key}>
              <button type="button" className="deck-stats-aspect-toggle" aria-expanded={open} onClick={() => onToggle(row.key)}>{bar}</button>
              {open && (
                <div className="deck-stats-subrows">
                  {pairs.map(pair => (
                    <OverlayRow
                      key={pair.key || 'only'}
                      label={<><AspectIcon aspect={row.key} size="sm" />{pair.key && <AspectIcon aspect={pair.key} size="sm" />}<span>{!pair.key ? 'only' : pair.key === row.key ? `${row.key} ×2` : pair.key}</span></>}
                      extra={showPenalty && pair.key && !providedKeys.has(pair.key) && pair.primary > 0 ? <span className="deck-stats-penalty">+2</span> : null}
                      primary={pair.primary} pool={pair.pool} max={pairMax} fill={ASPECT_FILL[row.key]}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Legend primaryLabel={primaryLabel}>
        <span><span className="deck-stats-provided">✓</span> from leader / base</span>
        {showPenalty && <span><span className="deck-stats-penalty">+2</span> off-aspect</span>}
      </Legend>
      <p className="deck-stats-hint">Select an aspect to split it by its pairings.</p>
    </StatsPanel>
  )
}

export function CostCurve({ buckets, primaryLabel }: { buckets: CurveBucket[]; primaryLabel: string }) {
  const max = Math.max(1, ...buckets.map(b => Math.max(b.pool, b.primaryTotal)))
  const h = (n: number) => `${(n / max) * 100}%`
  return (
    <StatsPanel label="Cost curve">
      <div className="deck-stats-curve" role="img" aria-label={`Cost curve: ${buckets.map(b => `${b.cost}${b.cost === buckets.length - 1 ? '+' : ''} costs ${b.primaryTotal} of ${b.pool}`).join(', ')}`}>
        {buckets.map(bucket => (
          <div className="deck-stats-curve-col" key={bucket.cost}>
            <span className="deck-stats-curve-ghost" style={{ height: h(bucket.pool) }} />
            <span className="deck-stats-curve-stack" style={{ height: h(bucket.primaryTotal) }}>
              {bucket.primaryTotal > 0 && <span className="deck-stats-curve-num">{bucket.primaryTotal}</span>}
              {KIND_ORDER.map(kind => bucket.primary[kind] > 0 && (
                <i key={kind} className={`deck-stats-kind--${kind}`} style={{ flexGrow: bucket.primary[kind] }} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="deck-stats-curve-axis">{buckets.map(b => <span key={b.cost}>{b.cost === buckets.length - 1 ? `${b.cost}+` : b.cost}</span>)}</div>
      <Legend primaryLabel={primaryLabel}>
        {KIND_ORDER.map(kind => <span key={kind}><i className={`deck-stats-swatch deck-stats-kind--${kind}`} />{KIND_LABELS[kind]}</span>)}
      </Legend>
    </StatsPanel>
  )
}

export function LabelChips({ label, rows, variant, activeLabel, onSelect, limit }: {
  label: string; rows: OverlayCount[]; variant: 'trait' | 'keyword'
  activeLabel: string | null; onSelect?: ((label: string) => void) | undefined; limit: number
}) {
  const shown = rows.slice(0, limit)
  const max = Math.max(1, ...shown.map(r => r.pool))
  if (shown.length === 0) return null
  return (
    <StatsPanel label={label}>
      <div className="deck-stats-chips">
        {shown.map(row => {
          const body = (
            <>
              <span className="deck-stats-chip-top">
                <span className={variant === 'trait' ? 'card-text-trait' : 'card-text-keyword'}>{row.key}</span>
                <span className="deck-stats-chip-count"><b>{row.primary}</b>/{row.pool}</span>
              </span>
              <span className={`deck-stats-minibar${variant === 'keyword' ? ' deck-stats-minibar--keyword' : ''}`} aria-hidden="true">
                <span className="deck-stats-minibar-ghost" style={{ width: `${(row.pool / max) * 100}%` }} />
                <span className="deck-stats-minibar-fill" style={{ width: `${(row.primary / max) * 100}%` }} />
              </span>
            </>
          )
          return onSelect
            ? <Button variant="toggle" glowColor="blue" size="sm" key={row.key} className="deck-stats-chip" active={activeLabel === row.key} aria-pressed={activeLabel === row.key} onClick={() => onSelect(row.key)}>{body}</Button>
            : <div key={row.key} className="deck-stats-chip deck-stats-chip--static">{body}</div>
        })}
      </div>
    </StatsPanel>
  )
}
