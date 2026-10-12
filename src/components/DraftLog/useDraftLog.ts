'use client'
import { useCallback, useEffect, useState } from 'react'
import type { HubView } from '../../services/pods/hubTypes'
import type { LogPick } from '../../services/draftLog/logModel'

export interface LogPlayer {
  seatNumber: number
  username: string
  userId: string
  isBot: boolean
  isLogPublic: boolean
  strategyDisplayName: string | null
  strategyDescription: string | null
  mixinDisplayName: string | null
  mixinDescription: string | null
  poolShareId: string | null
  poolIsPublic: boolean | null
}

export interface LogMeta {
  shareId: string
  setCode: string
  setName: string
  targetSeat: number | null
  playerName: string | null
  hostUsername: string | null
  players: LogPlayer[]
  viewableSeats: number[]
  isHost: boolean
  isDraftPublic: boolean
  myPlayerId: string | null
  /** The pod's host is a Friend of the Pod, so the draft has a review page. */
  reviewAvailable?: boolean
}

export interface LogData { picks: LogPick[]; meta: LogMeta }

/**
 * The Draft Log's data: the log API for one seat (?seat=), plus the pod's hub
 * view for its name, every seat's deck art and its matches. The host's
 * public/private switch is optimistic and reverts on failure.
 */
export function useDraftLog(shareId: string, seat: string | null) {
  const [data, setData] = useState<LogData | null>(null)
  const [hub, setHub] = useState<HubView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const url = `/api/draft/${encodeURIComponent(shareId)}/log${seat ? `?seat=${encodeURIComponent(seat)}` : ''}`
    fetch(url, { credentials: 'include' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.message || 'Failed to load draft log')
        if (!cancelled) { setData(body.data); setError(null) }
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load draft log') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [shareId, seat])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament`, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(body => { if (!cancelled && body) setHub(body as HubView) })
      .catch(() => { /* The log works without the pod's art. */ })
    return () => { cancelled = true }
  }, [shareId])

  const patchVisibility = (body: object) => fetch(`/api/draft/${encodeURIComponent(shareId)}/log/visibility`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
  }).then(r => r.ok).catch(() => false)

  const setDraftPublic = useCallback(async (value: boolean) => {
    if (!data) return
    const before = data
    setData({ ...data, meta: { ...data.meta, isDraftPublic: value, viewableSeats: value ? data.meta.players.map(p => p.seatNumber) : data.meta.viewableSeats } })
    if (!(await patchVisibility({ draftPublic: value }))) setData(before)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  /** The whole anonymised draft when it is public; otherwise this seat's picks. */
  const downloadJson = useCallback(async () => {
    if (!data) return
    let json: unknown = localJson(data)
    if (data.meta.isDraftPublic) {
      const r = await fetch(`/api/public/draft-log/${encodeURIComponent(shareId)}`).catch(() => null)
      if (r?.ok) { const result = await r.json(); json = result.data || result }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `draft-log-${shareId}.json` })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }, [data, shareId])

  return { data, hub, error, loading, setDraftPublic, downloadJson }
}

function localJson({ picks, meta }: LogData) {
  return {
    draft: { setCode: meta.setCode, setName: meta.setName, totalSeats: meta.players.length },
    picks: picks.map(pick => {
      const c = pick.visibleCards.find(x => x.instanceId === pick.pickedInstanceId) as Record<string, unknown> | undefined
      return {
        seat: meta.targetSeat, packNumber: pick.packNumber, pickInPack: pick.pickInPack,
        cardId: c?.cardId || c?.id || null, cardName: c?.name || null, rarity: c?.rarity || null, type: c?.type || null,
        aspects: c?.aspects || [], isLeader: pick.type === 'leader', leaderRound: pick.type === 'leader' ? pick.packNumber : null,
      }
    }),
  }
}
