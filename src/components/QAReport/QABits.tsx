'use client'

import { useId, useState, type ReactNode } from 'react'
import Button from '@/src/components/Button'
import { Kpi } from '@/src/components/DeckBuilder/DeckStats/DeckStatsModules'
import { barWidth, type QAStatus } from '@/src/services/qaReport'
import { QAStatusBadge } from './QAStatusBadge'

/** A health-strip tile: the deck-stats Kpi in a Meta-style tile, with its verdict under it. */
export function QAKpi({ value, of, label, note, status }: {
  value: string | number; of?: number | undefined; label: string; note?: string | undefined; status?: QAStatus | undefined
}) {
  return (
    <div className="qar-kpi">
      <Kpi value={value} of={of} label={label} note={note} />
      {status && <QAStatusBadge status={status} />}
    </div>
  )
}

/**
 * Observed vs expected: the observed value solid over a dashed outline for the
 * expected one, the deck-stats overlay-row pattern on Meta's themed track.
 */
export function QAOverlayRow({ label, value, reference, max, valueText, referenceText, status, fill }: {
  label: ReactNode
  value: number
  reference: number
  max: number
  valueText: string
  referenceText?: string | undefined
  status?: QAStatus | undefined
  fill?: string | undefined
}) {
  return (
    <div className={`qar-row${status ? '' : ' qar-row--plain'}`}>
      <span className="qar-row-label">{label}</span>
      <span className="mstats-track qar-row-track" aria-hidden="true">
        <span className="mstats-track-ghost" style={{ width: barWidth(reference, max) }} />
        <span className="mstats-track-fill" style={{ width: barWidth(value, max), background: fill }} />
      </span>
      <span className="qar-row-nums"><b>{valueText}</b>{referenceText && <span> vs {referenceText}</span>}</span>
      {status && <span className="qar-row-status"><QAStatusBadge status={status} /></span>}
    </div>
  )
}

export function QALegend({ value, reference, neutral = false }: { value: string; reference: string; neutral?: boolean }) {
  return (
    <div className="mstats-legend">
      <span><i className={`mstats-swatch ${neutral ? 'qar-swatch--solid' : 'mstats-swatch--top'}`} />{value}</span>
      <span><i className="mstats-swatch mstats-swatch--all" />{reference}</span>
    </div>
  )
}

/** "Show math" drawer, closed by default (the luck panel's toggle). */
export function QAMath({ children, label = 'math' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="qar-math">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={id}>
        {open ? `Hide ${label}` : `Show ${label}`}
      </Button>
      {open && <div id={id} className="qar-math-body">{children}</div>}
    </div>
  )
}

/** A rate as a percent; rates under 1% keep a second decimal so 0.35% doesn't read as 0.3%. */
export const pct = (rate: number | null | undefined, digits?: number) => (rate == null || !Number.isFinite(rate) ? '–' : `${(rate * 100).toFixed(digits ?? (Math.abs(rate) < 0.01 ? 2 : 1))}%`)
export const num = (n: number | null | undefined, digits = 2) => (n == null || !Number.isFinite(n) ? '–' : n.toFixed(digits))
