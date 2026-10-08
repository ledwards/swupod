'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { LeaderResultPlayer } from '../services/leaderDraftResults'

export function useLeaderDraftResults(shareId?: string | null, poolShareId?: string | null, refreshKey?: string) {
  const { user, loading: authLoading } = useAuth() as { user: { id: string } | null; loading: boolean }
  const [state, setState] = useState<{loading: boolean; error: boolean; players: LeaderResultPlayer[]}>({loading: true, error: false, players: []})
  useEffect(() => {
    if (authLoading) return
    const controller = new AbortController()
    setState({loading: true, error: false, players: []})
    if (!shareId && !poolShareId) {
      setState({loading: false, error: false, players: []})
      return
    }
    const query = new URLSearchParams(shareId ? {draft: shareId} : {pool: poolShareId!})
    fetch(`/api/draft/leader-results?${query}`, {credentials: 'include', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load leader results')
        return response.json()
      })
      .then(json => { if (!controller.signal.aborted) setState({loading: false, error: false, players: json.data?.players || []}) })
      .catch(() => { if (!controller.signal.aborted) setState({loading: false, error: true, players: []}) })
    return () => controller.abort()
  }, [shareId, poolShareId, user?.id, authLoading, refreshKey])
  return state
}
