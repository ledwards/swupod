'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import './CardStatsBadge.css'

type CardLike = {
  id?: string | null
  cardId?: string | null
  card_id?: string | null
  name?: string | null
  cardName?: string | null
  title?: string | null
  subtitle?: string | null
  type?: string | null
  cardType?: string | null
  setCode?: string | null
  imageUrl?: string | null
  isLeader?: boolean
  isBase?: boolean
  isPlaceholder?: boolean
}

type LookupResult = {
  cardData: any | null
  pickData: any | null
}

const lookupCache = new Map<string, Promise<LookupResult>>()

function cardName(card: CardLike): string {
  return card?.name || card?.cardName || card?.title || 'Card'
}

function cardSubtitle(card: CardLike): string | null {
  return card?.subtitle || null
}

function cardType(card: CardLike): string {
  if (card?.isLeader) return 'Leader'
  if (card?.isBase) return 'Base'
  return card?.type || card?.cardType || 'Card'
}

function cardId(card: CardLike): string | null {
  return card?.cardId || card?.card_id || card?.id || null
}

function resolveSetCode(card: CardLike, explicitSetCode?: string | null): string {
  if (explicitSetCode) return explicitSetCode.toUpperCase()
  if (card?.setCode) return card.setCode.toUpperCase()
  const id = cardId(card)
  const match = id?.match(/^([A-Z]{2,5})[_-]/i)
  return match?.[1] ? match[1].toUpperCase() : 'all'
}

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function sameCard(row: any, card: CardLike): boolean {
  const id = normalize(cardId(card))
  const rowId = normalize(row?.cardId || row?.id || row?.card_id)
  if (id && rowId && id === rowId) return true

  return normalize(row?.cardName || row?.name) === normalize(cardName(card))
    && normalize(row?.subtitle) === normalize(cardSubtitle(card))
}

function firstMatching(rows: any[] | undefined, card: CardLike): any | null {
  if (!Array.isArray(rows)) return null
  return rows.find((row) => sameCard(row, card)) || null
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Stats request failed (${res.status})`)
  const body = await res.json()
  return body?.data || body
}

async function lookupCardStats(card: CardLike, setCode: string): Promise<LookupResult> {
  const key = `${setCode}|${cardType(card)}|${cardId(card) || ''}|${cardName(card)}|${cardSubtitle(card) || ''}`
  if (!lookupCache.has(key)) {
    lookupCache.set(key, (async () => {
      const cardParams = new URLSearchParams({
        setCode,
        since: '2020-01-01',
        until: '2099-12-31',
        format: 'all',
        source: 'all',
      })
      const pickParams = new URLSearchParams({
        setCode,
        since: '2020-01-01',
        until: '2099-12-31',
        type: cardType(card) === 'Leader' ? 'leaders' : 'cards',
      })

      const [cardDataResponse, pickDataResponse] = await Promise.all([
        fetchJson(`/api/stats/card-data?${cardParams}`),
        cardType(card) === 'Base'
          ? Promise.resolve(null)
          : fetchJson(`/api/stats/draft-picks?${pickParams}`).catch(() => null),
      ])

      const section = cardType(card) === 'Leader'
        ? cardDataResponse?.leaders
        : cardType(card) === 'Base'
          ? cardDataResponse?.bases
          : cardDataResponse?.cards

      return {
        cardData: firstMatching(section, card),
        pickData: firstMatching(pickDataResponse?.cards, card),
      }
    })())
  }
  return lookupCache.get(key)!
}

function pct(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '-'
}

function count(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString() : '-'
}

function numberValue(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-'
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="card-stats-modal-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

export function CardStatsBadge({
  card,
  setCode,
  className = '',
}: {
  card: CardLike | null | undefined
  setCode?: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LookupResult | null>(null)

  const resolvedSetCode = useMemo(() => card ? resolveSetCode(card, setCode) : 'all', [card, setCode])
  const show = Boolean(card?.imageUrl && !card?.isPlaceholder && cardName(card).trim())

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open || !card) return
    let cancelled = false
    setLoading(true)
    setError(null)
    lookupCardStats(card, resolvedSetCode)
      .then((next) => { if (!cancelled) setResult(next) })
      .catch((err) => {
        if (!cancelled) {
          setResult(null)
          setError(err instanceof Error ? err.message : 'Unable to load card stats.')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [card, open, resolvedSetCode])

  if (!show || !card) return null

  const name = cardName(card)
  const subtitle = cardSubtitle(card)
  const data = result?.cardData
  const pick = result?.pickData

  return (
    <>
      <button
        type="button"
        className={`card-stats-badge ${className}`.trim()}
        title={`Card stats for ${name}`}
        aria-label={`Card stats for ${name}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" focusable="false">
          <path d="M2.5 12.5h11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
          <path d="M4 10V6.5M8 10V3.5M12 10V8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div className="card-stats-modal-backdrop" onClick={() => setOpen(false)}>
          <section
            className="card-stats-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Card stats for ${name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="card-stats-modal-header">
              <div>
                <p>Card Stats</p>
                <h2>{name}</h2>
                <span>{[subtitle, resolvedSetCode === 'all' ? 'All sets' : resolvedSetCode, cardType(card)].filter(Boolean).join(' / ')}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close card stats">x</button>
            </header>

            {loading ? (
              <div className="card-stats-modal-note">Loading card stats...</div>
            ) : error ? (
              <div className="card-stats-modal-error">{error}</div>
            ) : data || pick ? (
              <>
                <div className="card-stats-modal-grid">
                  <Metric label="Grade" value={data?.grade || '-'} detail={data?.gradeStatusLabel || data?.gradeBasis || null} />
                  <Metric label="GP WR" value={pct(data?.gpWr)} detail={data?.gpCount != null ? `${count(data.gpCount)} GP` : null} />
                  <Metric label="Decks" value={count(data?.deckCount)} />
                  <Metric label="Avg Pick" value={numberValue(pick?.avgPickPosition)} detail={pick?.timesPicked != null ? `${count(pick.timesPicked)} picks` : null} />
                  <Metric label="First Pick" value={pct(pick?.firstPickPct)} />
                  <Metric label="P1P1" value={pct(pick?.p1p1Pct)} />
                </div>
                {data?.sampleWarning ? <div className="card-stats-modal-note">{data.sampleWarning}</div> : null}
              </>
            ) : (
              <div className="card-stats-modal-note">No card stats are available for this set yet.</div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

export default CardStatsBadge
