// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback, use } from 'react'
import DeckBuilder from '../../../../../src/components/DeckBuilder'
import PoolBuilds from '../../../../../src/components/PoolBuilds'
import ChatPanel from '../../../../../src/components/ChatPanel'
import { loadPool, updatePool } from '../../../../../src/utils/poolApi'
import { useAuth } from '../../../../../src/contexts/AuthContext'
import '../../../../../src/App.css'
import '../../../../../src/components/ChatPanel.css'

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
  params: Promise<{ shareId: string; buildId: string }>
}

export default function BuildDeckPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const { user } = useAuth()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingStateRef = useRef<Record<string, unknown> | null>(null)

  const rootShareId = resolvedParams.shareId
  const buildId = resolvedParams.buildId

  useEffect(() => {
    async function fetchPool() {
      if (!buildId) return
      try {
        setLoading(true)
        const poolData = await loadPool(buildId)
        setPool(poolData)
      } catch (err) {
        console.error('Failed to load build:', err)
        setError(err instanceof Error ? err.message : 'Failed to load build')
      } finally {
        setLoading(false)
      }
    }

    fetchPool()

    const handleFocus = () => {
      if (buildId) {
        loadPool(buildId).then(setPool).catch(console.error)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [buildId])

  useEffect(() => {
    if (error || (!loading && !pool)) {
      window.location.href = `/pool/${rootShareId}/deck`
    }
  }, [error, loading, pool, rootShareId])

  const handleBack = () => {
    window.location.href = `/pool/${rootShareId}/deck`
  }

  const handleDeckStateChange = useCallback((deckBuilderState: Record<string, unknown>) => {
    pendingStateRef.current = deckBuilderState
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      if (pool?.shareId && pendingStateRef.current) {
        try {
          await updatePool(pool.shareId, { deckBuilderState: pendingStateRef.current })
        } catch (err) {
          console.error('Failed to save deck builder state:', err)
        }
      }
    }, 2000)
  }, [pool])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (pendingStateRef.current && pool?.shareId) {
        updatePool(pool.shareId, { deckBuilderState: pendingStateRef.current }).catch(() => {})
      }
    }
  }, [pool])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingStateRef.current && pool?.shareId) {
        const data = JSON.stringify({ shareId: pool.shareId, deckBuilderState: pendingStateRef.current })
        navigator.sendBeacon('/api/pools/save-state', data)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [pool])

  const allCards = pool
    ? (pool.poolType === 'draft'
        ? pool.cards || []
        : (pool.packs ? pool.packs.flatMap(pack => pack.cards) : pool.cards) || [])
    : []

  const savedState = pool?.deckBuilderState
    ? (typeof pool.deckBuilderState === 'string' ? pool.deckBuilderState : JSON.stringify(pool.deckBuilderState))
    : null

  const getPoolName = () => {
    if (pool?.deckBuilderState) {
      const state = typeof pool.deckBuilderState === 'string'
        ? JSON.parse(pool.deckBuilderState)
        : pool.deckBuilderState
      if (state.poolName) return state.poolName
    }
    return pool?.name || null
  }

  const draftShareId = pool?.draftShareId || null
  const isOwner = Boolean(user && pool && user.id === (pool.owner?.id || pool.userId))

  return (
    <div className={draftShareId ? 'page-with-chat' : ''}>
      <div className={draftShareId ? 'page-content' : ''}>
        <div className="app">
          {!loading && (
            <PoolBuilds
              shareId={rootShareId}
              currentUserId={user?.id || null}
              isOwner={false}
            />
          )}
          <DeckBuilder
            cards={allCards}
            setCode={pool?.setCode || null}
            onBack={handleBack}
            savedState={savedState}
            onStateChange={isOwner ? handleDeckStateChange : undefined}
            shareId={pool?.shareId || buildId}
            poolCreatedAt={isOwner ? pool?.createdAt : undefined}
            poolType={pool?.poolType}
            poolName={getPoolName()}
            poolOwnerUsername={pool?.owner?.username}
            poolOwnerId={pool?.owner?.id || pool?.userId}
            draftShareId={draftShareId}
          />
        </div>
      </div>
      {draftShareId && <ChatPanel shareId={draftShareId} defaultOpen={false} />}
    </div>
  )
}
