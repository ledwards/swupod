// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback, use } from 'react'
import DeckBuilder from '../../../../src/components/DeckBuilder'
import PoolBuilds from '../../../../src/components/PoolBuilds'
import ChatPanel from '../../../../src/components/ChatPanel'
import { loadPool, updatePool } from '../../../../src/utils/poolApi'
import { usePoolBuildsSocket } from '../../../../src/hooks/usePoolBuildsSocket'
import { useAuth } from '../../../../src/contexts/AuthContext'
import { useTrackPoolView } from '../../../../src/hooks/useTrackPoolView'
import '../../../../src/App.css'
import '../../../../src/components/ChatPanel.css'

interface CardType {
  id?: string
  name?: string
  [key: string]: unknown
}

interface PackType {
  cards: CardType[]
  [key: string]: unknown
}

interface PoolOwner {
  id: string
  username?: string
  [key: string]: unknown
}

interface PoolData {
  shareId: string
  setCode: string
  cards?: CardType[]
  packs?: PackType[]
  poolType?: string
  deckBuilderState?: string | Record<string, unknown>
  createdAt?: string
  name?: string
  owner?: PoolOwner
  userId?: string
  draftShareId?: string
  parentShareId?: string | null
  buildCount?: number
}

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function DeckBuilderPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const { user } = useAuth()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingStateRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  useTrackPoolView(shareId)

  useEffect(() => {
    async function fetchPool() {
      if (!shareId) return

      try {
        setLoading(true)
        const poolData = await loadPool(shareId)
        setPool(poolData)
      } catch (err) {
        console.error('Failed to load pool:', err)
        setError(err instanceof Error ? err.message : 'Failed to load pool')
      } finally {
        setLoading(false)
      }
    }

    fetchPool()

    // Refresh pool data when window regains focus (in case name was changed elsewhere)
    const handleFocus = () => {
      if (shareId) {
        loadPool(shareId).then(setPool).catch(console.error)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [shareId])

  useEffect(() => {
    if (error || (!loading && !pool)) {
      window.location.href = '/sealed'
    }
  }, [error, loading, pool])

  const handleBack = () => {
    if (shareId) {
      window.location.href = `/pool/${shareId}`
    }
  }

  const handleDeckStateChange = useCallback((deckBuilderState: Record<string, unknown>) => {
    // Debounced auto-save - only save after 2 seconds of no changes
    pendingStateRef.current = deckBuilderState

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (pool && pool.shareId && pendingStateRef.current) {
        try {
          await updatePool(pool.shareId, { deckBuilderState: pendingStateRef.current })
          const root = pool.parentShareId || pool.shareId
          window.dispatchEvent(new CustomEvent('wf:builds-changed', { detail: { rootShareId: root } }))
        } catch (err) {
          console.error('Failed to save deck builder state:', err)
        }
      }
    }, 2000)
  }, [pool])

  // Save pending state on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      // Flush any pending save immediately on unmount
      if (pendingStateRef.current && pool?.shareId) {
        updatePool(pool.shareId, { deckBuilderState: pendingStateRef.current }).catch(() => {})
      }
    }
  }, [pool])

  // Save pending state on page refresh/close using sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingStateRef.current && pool?.shareId) {
        // Use sendBeacon for reliable delivery during page unload
        const data = JSON.stringify({
          shareId: pool.shareId,
          deckBuilderState: pendingStateRef.current
        })
        navigator.sendBeacon('/api/pools/save-state', data)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [pool])

  // Always render DeckBuilder immediately - show UI structure even while loading
  // Cards will be empty initially and populate once pool data loads
  // For draft pools, use pool.cards (drafted cards including leaders) not pool.packs (original pack cards)
  const allCards = pool
    ? (pool.poolType === 'draft'
        ? pool.cards || []
        : (pool.packs ? pool.packs.flatMap(pack => pack.cards) : pool.cards) || [])
    : []
  const setCode = pool?.setCode || null
  // Handle deckBuilderState - it might be a string or object
  const savedState = pool?.deckBuilderState
    ? (typeof pool.deckBuilderState === 'string'
        ? pool.deckBuilderState
        : JSON.stringify(pool.deckBuilderState))
    : null

  // Extract pool name from deckBuilderState (source of truth) or fall back to pool.name
  const getPoolNameFromState = () => {
    if (pool?.deckBuilderState) {
      const state = typeof pool.deckBuilderState === 'string'
        ? JSON.parse(pool.deckBuilderState)
        : pool.deckBuilderState
      if (state.poolName) return state.poolName
    }
    return pool?.name || null
  }
  const poolName = getPoolNameFromState()

  const draftShareId = pool?.draftShareId || null
  const isOwner = user && pool?.owner && user.id === (pool.owner.id || pool.userId)

  const [deckBuildDeadline, setDeckBuildDeadline] = useState<string | null>(null)

  useEffect(() => {
    if (!draftShareId) return
    fetch(`/api/draft/${draftShareId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.deckBuildDeadline) {
          setDeckBuildDeadline(data.deckBuildDeadline)
        }
      })
      .catch(() => {})
  }, [draftShareId])

  const rootShareId = pool?.parentShareId || pool?.shareId || null
  const isChildBuild = Boolean(pool?.parentShareId)

  usePoolBuildsSocket(rootShareId)

  return (
    <div className={draftShareId ? 'page-with-chat' : ''}>
      <div className={draftShareId ? 'page-content' : ''}>
        <div className="app">
          <DeckBuilder
            cards={allCards}
            setCode={setCode}
            onBack={handleBack}
            savedState={savedState}
            onStateChange={isOwner ? handleDeckStateChange : undefined}
            shareId={shareId}
            poolCreatedAt={isOwner ? pool?.createdAt : undefined}
            poolType={pool?.poolType}
            poolName={poolName}
            poolOwnerUsername={pool?.owner?.username}
            poolOwnerId={pool?.owner?.id || pool?.userId}
            draftShareId={draftShareId}
            deckBuildDeadline={deckBuildDeadline}
            rootShareId={rootShareId}
            currentUserId={user?.id || null}
          />
        </div>
      </div>
      {draftShareId && <ChatPanel shareId={draftShareId} defaultOpen={false} />}
    </div>
  )
}
