// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useDeckAutosave } from '@/src/hooks/useDeckAutosave'
import DeckBuilder from '../../../../../src/components/DeckBuilder'
import PoolBuilds from '../../../../../src/components/PoolBuilds'
import ChatPanel from '../../../../../src/components/ChatPanel'
import { loadPool } from '../../../../../src/utils/poolApi'
import { usePoolBuildsSocket } from '../../../../../src/hooks/usePoolBuildsSocket'
import { useAuth } from '../../../../../src/contexts/AuthContext'
import { useTrackPoolView } from '../../../../../src/hooks/useTrackPoolView'
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


  const rootShareId = resolvedParams.shareId
  const buildId = resolvedParams.buildId

  usePoolBuildsSocket(rootShareId)
  useTrackPoolView(buildId)
  useTrackPoolView(rootShareId)

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
      window.location.href = `/pools/${rootShareId}/deck`
    }
  }, [error, loading, pool, rootShareId])

  const handleBack = () => {
    window.location.href = `/pools/${rootShareId}/deck`
  }

  const { schedule: handleDeckStateChange, saveNow } = useDeckAutosave(pool?.shareId, rootShareId)

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
  const limitedMode = pool?.poolType === 'draft' && draftShareId
    ? draftLimitedMode
    : draftShareId
      ? 'group'
      : 'solo'

  useEffect(() => {
    if (!draftShareId || pool?.poolType !== 'draft') {
      setDraftLimitedMode(null)
      return
    }

    fetch(`/api/draft/${draftShareId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setDraftLimitedMode(data?.settings?.isSolo === true ? 'solo' : 'group')
      })
      .catch(() => {})
  }, [draftShareId, pool?.poolType])

  return (
    <div className={draftShareId ? 'page-with-chat' : ''}>
      <div className={draftShareId ? 'page-content' : ''}>
        <div className="app">
          <DeckBuilder
            cards={allCards}
            setCode={pool?.setCode || null}
            onBack={handleBack}
            savedState={savedState}
            onSaveBeforePlay={saveNow}
            onStateChange={isOwner ? handleDeckStateChange : undefined}
            shareId={pool?.shareId || buildId}
            poolCreatedAt={isOwner ? pool?.createdAt : undefined}
            poolType={pool?.poolType}
            poolName={getPoolName()}
            poolOwnerUsername={pool?.owner?.username}
            poolOwnerId={pool?.owner?.id || pool?.userId}
            draftShareId={draftShareId}
            rootShareId={rootShareId}
            currentUserId={user?.id || null}
            limitedMode={limitedMode}
          />
        </div>
      </div>
      {draftShareId && <ChatPanel shareId={draftShareId} defaultOpen={false} />}
    </div>
  )
}
