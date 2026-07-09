'use client'

import { useEffect, useMemo, useState } from 'react'
import './CardStatsBadge.css'
import Modal from './Modal'
import { CardDataStatsModal } from './CardDataTierList'

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

      const cardDataResponse = await fetchJson(`/api/stats/card-data?${cardParams}`)

      const section = cardType(card) === 'Leader'
        ? cardDataResponse?.leaders
        : cardType(card) === 'Base'
          ? cardDataResponse?.bases
          : cardDataResponse?.cards

      return {
        cardData: firstMatching(section, card),
      }
    })())
  }
  return lookupCache.get(key)!
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
  const data = result?.cardData
  const formatLabel = resolvedSetCode === 'all' ? 'All sets' : resolvedSetCode

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
        <img src="/branding/wayfinder_icon.svg" alt="" aria-hidden="true" draggable={false} />
      </button>

      {/* Reuse the canonical stats-page card modal (CardDataStatsModal) verbatim
          once data has loaded. While loading / on error / when no stats exist,
          reuse the same shared <Modal> chrome so the experience is identical. */}
      {mounted && open && (
        data ? (
          <CardDataStatsModal
            card={data}
            onClose={() => setOpen(false)}
            formatLabel={formatLabel}
            sampleWarningLabel={data.sampleWarning}
          />
        ) : (
          <Modal isOpen onClose={() => setOpen(false)} showCloseButton className="card-data-stats-modal">
            <div className="card-data-stats-modal-body">
              <p className="card-data-stats-modal-warning">
                {loading ? `Loading card stats for ${name}…` : error ? error : 'No card stats are available for this set yet.'}
              </p>
            </div>
          </Modal>
        )
      )}
    </>
  )
}

export default CardStatsBadge
