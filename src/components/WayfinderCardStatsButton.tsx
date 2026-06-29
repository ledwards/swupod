// @ts-nocheck
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CardData } from './Card'
import {
  SEVENTEEN_LANDS_METRICS,
  formatSeventeenLandsDeltaMetric,
  formatSeventeenLandsRateMetric,
} from '@/src/services/cardDataMetrics'

type CardDataStatsRow = {
  cardName: string
  cardId: string | null
  subtitle: string | null
  rarity: string
  cardType: string
  aspects: string[]
  cost: number | null
  imageUrl: string | null
  backImageUrl?: string | null
  isLeader?: boolean
  isBase?: boolean
  grade: string | null
  gradeBasis: string
  gradeStatusLabel: string
  gpCount: number
  gpWins: number
  gpWr: number | null
  ohCount: number | null
  ohWr: number | null
  gdCount: number | null
  gdWr: number | null
  gihCount: number | null
  gihWr: number | null
  gnsCount: number | null
  gnsWr: number | null
  iih: number | null
  playedRate: number | null
  resourcedWhenSeen: number | null
  playedWar: number | null
  sampleWarning: string | null
}

type CardDataStatsPayload = {
  setCode: string
  format: string
  source: string
  replayMetricsStatus: string
  gradeBasis: string
  cards: CardDataStatsRow[]
  leaders: CardDataStatsRow[]
  bases: CardDataStatsRow[]
}

type DisplayMetric = {
  key: string
  label: string
  value: string
  formula: string
}

type LookupState =
  | { status: 'idle'; row: null; payload: null; error: null }
  | { status: 'loading'; row: null; payload: null; error: null }
  | { status: 'loaded'; row: CardDataStatsRow | null; payload: CardDataStatsPayload; error: null }
  | { status: 'error'; row: null; payload: null; error: string }

const statsCache = new Map<string, CardDataStatsPayload>()
const CARD_METRIC_FORMULA_COPY: Record<string, string> = {
  grade: 'Selected Limited metric compared with other cards under the same format, era/date, and source filters',
  gpWr: 'Wins with this card in the deck / games with this card in the deck',
  ohWr: 'Wins when this card starts in the opening hand / opening hands containing this card',
  gdWr: 'Wins when this card is drawn after the opener / games where this card is drawn after the opener',
  gihWr: 'Wins when this card is seen in hand / games where this card is seen in hand',
  gnsWr: 'Wins when this card is not seen / games where this card is not seen',
  iih: 'Win rate when seen in hand minus win rate when not seen',
  playedRate: 'Copies played from seen hand / copies seen in hand',
  resourcedWhenSeen: 'Copies resourced from seen hand / copies seen in hand',
  playedWar: 'Win rate when played minus win rate when in deck but not played',
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function slugish(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizeCardId(value: string | null | undefined): string | null {
  const cleaned = clean(value)?.replace(/-/g, '_').toUpperCase() ?? null
  return cleaned
}

function deriveSetCode(card: CardData): string {
  const id = normalizeCardId(card.cardId || card.id)
  const match = id?.match(/^([A-Z]{2,5})_/)
  return match?.[1] ?? 'all'
}

function statsUrl(card: CardData): string {
  const params = new URLSearchParams({
    setCode: deriveSetCode(card),
    format: 'limited',
    source: 'online',
  })
  return `/api/stats/card-data?${params.toString()}`
}

function candidateRows(payload: CardDataStatsPayload, card: CardData): CardDataStatsRow[] {
  if (card.isLeader) return payload.leaders || []
  if (card.isBase) return payload.bases || []
  return payload.cards || []
}

function findCardRow(payload: CardDataStatsPayload, card: CardData): CardDataStatsRow | null {
  const rows = candidateRows(payload, card)
  const ids = new Set([normalizeCardId(card.cardId), normalizeCardId(card.id)].filter(Boolean))
  const byId = rows.find((row) => row.cardId && ids.has(normalizeCardId(row.cardId)))
  if (byId) return byId
  const cardName = slugish(card.name)
  return rows.find((row) => slugish(row.cardName) === cardName) ?? null
}

function rowRateNumerator(ratePct: number | null | undefined, count: number | null | undefined): number | null {
  if (ratePct == null || count == null || !Number.isFinite(ratePct) || !Number.isFinite(count)) return null
  return (ratePct / 100) * count
}

function toPercentagePoints(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.abs(value) <= 1 ? value * 100 : value
}

function metricRows(row: CardDataStatsRow): DisplayMetric[] {
  const gp = formatSeventeenLandsRateMetric('gpWr', row.gpWins, row.gpCount)
  const oh = formatSeventeenLandsRateMetric('ohWr', rowRateNumerator(row.ohWr, row.ohCount), row.ohCount)
  const gd = formatSeventeenLandsRateMetric('gdWr', rowRateNumerator(row.gdWr, row.gdCount), row.gdCount)
  const gih = formatSeventeenLandsRateMetric('gihWr', rowRateNumerator(row.gihWr, row.gihCount), row.gihCount)
  const gns = formatSeventeenLandsRateMetric('gnsWr', rowRateNumerator(row.gnsWr, row.gnsCount), row.gnsCount)
  const iih = formatSeventeenLandsDeltaMetric('iih', toPercentagePoints(row.iih))
  const pr = formatSeventeenLandsRateMetric('playedRate', rowRateNumerator(row.playedRate, row.gihCount), row.gihCount)
  const rws = formatSeventeenLandsRateMetric('resourcedWhenSeen', rowRateNumerator(row.resourcedWhenSeen, row.gihCount), row.gihCount)
  const pwar = formatSeventeenLandsDeltaMetric('playedWar', toPercentagePoints(row.playedWar))

  return [
    { key: 'grade', label: 'G', value: row.grade || 'U', formula: CARD_METRIC_FORMULA_COPY.grade },
    { key: 'gpWr', label: gp.label, value: gp.value, formula: CARD_METRIC_FORMULA_COPY.gpWr },
    { key: 'ohWr', label: oh.label, value: oh.value, formula: CARD_METRIC_FORMULA_COPY.ohWr },
    { key: 'gdWr', label: gd.label, value: gd.value, formula: CARD_METRIC_FORMULA_COPY.gdWr },
    { key: 'gihWr', label: gih.label, value: gih.value, formula: CARD_METRIC_FORMULA_COPY.gihWr },
    { key: 'gnsWr', label: gns.label, value: gns.value, formula: CARD_METRIC_FORMULA_COPY.gnsWr },
    { key: 'iih', label: iih.label, value: iih.value, formula: CARD_METRIC_FORMULA_COPY.iih },
    { key: 'playedRate', label: pr.label, value: pr.value, formula: CARD_METRIC_FORMULA_COPY.playedRate },
    { key: 'resourcedWhenSeen', label: rws.label, value: rws.value, formula: CARD_METRIC_FORMULA_COPY.resourcedWhenSeen },
    { key: 'playedWar', label: pwar.label, value: pwar.value, formula: CARD_METRIC_FORMULA_COPY.playedWar },
  ]
}

function splitMetricValue(value: string): { primary: string; secondary: string | null } {
  const match = value.match(/^(.+?)\s+\(([^)]+)\)$/)
  if (!match) return { primary: value, secondary: null }
  return {
    primary: match[1].replace(/(\d+)\.0%$/, '$1%'),
    secondary: match[2],
  }
}

function MetricCell({ metric }: { metric: DisplayMetric }) {
  const value = splitMetricValue(metric.value)
  return (
    <div className="swupod-17l-metric-cell" title={metric.formula}>
      <div className="swupod-17l-metric-label">{metric.label}</div>
      <div className="swupod-17l-metric-value">{value.primary}</div>
      {value.secondary && <div className="swupod-17l-metric-secondary">{value.secondary}</div>}
      <div className="swupod-17l-metric-formula">{metric.formula}</div>
    </div>
  )
}

function StatsModal({ state, card, onClose }: { state: LookupState; card: CardData; onClose: () => void }) {
  return createPortal(
    <div className="swupod-17l-modal-backdrop" onClick={onClose}>
      <div className="swupod-17l-modal" role="dialog" aria-label="Wayfinder card stats" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="swupod-17l-modal-close" aria-label="Close card stats" onClick={onClose}>×</button>
        {state.status === 'loaded' && state.row ? (
          <div className="swupod-17l-panel">
            <div className="swupod-17l-panel-header">
              <div>
                <div className="swupod-17l-kicker">Wayfinder Card Stats</div>
                <h2>{state.row.cardName}{state.row.subtitle && <span>{state.row.subtitle}</span>}</h2>
                <p>{state.payload.setCode} / limited / online</p>
              </div>
              <div className="swupod-17l-grade">{state.row.grade || 'U'}</div>
            </div>
            <div className="swupod-17l-metric-grid">
              {metricRows(state.row).map((metric) => <MetricCell key={metric.key} metric={metric} />)}
            </div>
            {state.row.sampleWarning && <div className="swupod-17l-note">{state.row.sampleWarning}</div>}
            {state.payload.replayMetricsStatus !== 'available' && (
              <div className="swupod-17l-note">Replay-hand metrics are {state.payload.replayMetricsStatus}; decklist-derived fields are shown where available.</div>
            )}
          </div>
        ) : state.status === 'loaded' ? (
          <div className="swupod-17l-empty">No card stats found for {card.name || 'this card'} in Limited online play for this set and date window.</div>
        ) : state.status === 'error' ? (
          <div className="swupod-17l-empty">{state.error}</div>
        ) : (
          <div className="swupod-17l-empty">Loading card stats...</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function WayfinderCardStatsButton({ card }: { card: CardData }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LookupState>({ status: 'idle', row: null, payload: null, error: null })
  const url = useMemo(() => statsUrl(card), [card])

  useEffect(() => {
    if (!open) return
    const cached = statsCache.get(url)
    if (cached) {
      setState({ status: 'loaded', payload: cached, row: findCardRow(cached, card), error: null })
      return
    }
    let cancelled = false
    setState({ status: 'loading', row: null, payload: null, error: null })
    fetch(url)
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok || body?.success === false) throw new Error(body?.message || 'Card stats failed to load')
        return body.data as CardDataStatsPayload
      })
      .then((payload) => {
        if (cancelled) return
        statsCache.set(url, payload)
        setState({ status: 'loaded', payload, row: findCardRow(payload, card), error: null })
      })
      .catch((error) => {
        if (cancelled) return
        setState({ status: 'error', row: null, payload: null, error: error instanceof Error ? error.message : 'Card stats failed to load' })
      })
    return () => { cancelled = true }
  }, [card, open, url])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!card || card.isPlaceholder || !card.name) return null

  return (
    <>
      <button
        type="button"
        className="swupod-card-17l-button"
        aria-label="Show Wayfinder card stats"
        title="Show Wayfinder card stats"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <img src="/branding/wayfinder_logo.svg" alt="" aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' && <StatsModal state={state} card={card} onClose={() => setOpen(false)} />}
    </>
  )
}

export default WayfinderCardStatsButton
