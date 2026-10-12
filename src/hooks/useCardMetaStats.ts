/**
 * useCardMetaStats: the set's 17lands-style card stats from Wayfinder's online
 * Limited games, for the Meta tab and the deckbuilder drawer's Meta preview.
 */

import { useEffect, useState } from 'react'
import type { CardMetaStats } from '../services/deckStats'

export type CardMetaState = { loading: boolean; error: boolean; cards: CardMetaStats[]; games: number | null }

export function useCardMetaStats(setCode: string | null | undefined): CardMetaState {
  const [state, setState] = useState<CardMetaState>({ loading: true, error: false, cards: [], games: null })
  useEffect(() => {
    if (!setCode) { setState({ loading: false, error: false, cards: [], games: null }); return }
    let cancelled = false
    setState(prev => ({ ...prev, loading: true, error: false }))
    const params = new URLSearchParams({ setCode, format: 'limited', source: 'online', population: 'wayfinder' })
    fetch(`/api/stats/card-data?${params}`)
      .then(res => { if (!res.ok) throw new Error(`card data ${res.status}`); return res.json() })
      .then(body => {
        if (cancelled) return
        const data = body?.data || body
        setState({ loading: false, error: false, cards: Array.isArray(data?.cards) ? data.cards : [], games: data?.populationCounts?.uniqueGames ?? data?.totalMatches ?? null })
      })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, cards: [], games: null }) })
    return () => { cancelled = true }
  }, [setCode])
  return state
}
