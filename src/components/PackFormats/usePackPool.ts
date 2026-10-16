'use client'
import { useEffect, useState } from 'react'
import type { PackPool } from './packFormats'

export interface PackPoolRecord {
  pool: PackPool
  wins: number
  losses: number
  draws: number
  wayfinderMatchIds: string[]
}

/** Loads a Pack Wars / Pack Blitz pool the same way the legacy pages do (`GET /api/pools/[shareId]`). */
export function usePackPool(shareId: string): { record: PackPoolRecord | null; error: string | null } {
  const [record, setRecord] = useState<PackPoolRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const c = new AbortController()
    fetch(`/api/pools/${encodeURIComponent(shareId)}`, { credentials: 'include', signal: c.signal })
      .then(async r => {
        if (!r.ok) throw new Error('Pool not found')
        const { data } = await r.json()
        const pool = (typeof data.cards === 'string' ? JSON.parse(data.cards) : data.cards) as PackPool
        setRecord({
          pool: { ...pool, leaders: pool.leaders ?? [], bases: pool.bases ?? [], deckCards: pool.deckCards ?? [] },
          wins: data.wins ?? 0,
          losses: data.losses ?? 0,
          draws: data.draws ?? 0,
          wayfinderMatchIds: Array.isArray(data.wayfinderMatchIds) ? data.wayfinderMatchIds : [],
        })
      })
      .catch(err => { if (!c.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to load pool') })
    return () => c.abort()
  }, [shareId])
  return { record, error }
}
