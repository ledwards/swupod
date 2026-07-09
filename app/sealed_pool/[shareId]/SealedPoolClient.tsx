// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import SealedPod from '../../../src/components/SealedPod'
import PoolBuilds from '../../../src/components/PoolBuilds'
import Button from '../../../src/components/Button'
import { loadPool } from '../../../src/utils/poolApi'
import { useAuth } from '../../../src/contexts/AuthContext'
import { useTrackPoolView } from '../../../src/hooks/useTrackPoolView'
import '../../../src/App.css'

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
  [key: string]: unknown
}

interface PoolData {
  shareId: string
  setCode: string
  setName?: string
  cards?: CardType[]
  packs?: PackType[]
  poolType?: string
  deckBuilderState?: string | Record<string, unknown>
  createdAt?: string
  name?: string
  owner?: PoolOwner
  userId?: string
  hasBox?: boolean
  shuffledPacks?: boolean
  parentShareId?: string | null
  buildCount?: number
}

export default function SealedPoolClient({ shareId }: { shareId: string }) {
  const { user } = useAuth()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useTrackPoolView(shareId)

  useEffect(() => {
    let cancelled = false

    async function fetchPool() {
      if (!shareId) return

      let retries = 0
      // A genuinely-missing pool should 404 fast, not hang. Keep a couple of
      // short retries only to cover the just-created replication race, then bail.
      const maxRetries = 2

      const attemptLoad = async (): Promise<boolean> => {
        if (cancelled) return false

        try {
          setLoading(true)
          const poolData = await loadPool(shareId)

          if (cancelled) return false

          // Redirect to draft_pool if this is actually a draft pool
          if (poolData.poolType === 'draft') {
            window.location.href = `/draft_pool/${shareId}`
            return false
          }

          setPool(poolData)
          setError(null)
          setLoading(false)
          return true
        } catch (err) {
          if (cancelled) return false

          console.error(`Failed to load pool (attempt ${retries + 1}):`, err)

          if (err instanceof Error && (err.message.includes('not found') || err.message.includes('Pool not found')) && retries < maxRetries) {
            retries++
            await new Promise(resolve => setTimeout(resolve, 500))
            return attemptLoad()
          }

          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load pool')
            setLoading(false)
          }
          return false
        }
      }

      attemptLoad()

      return () => {
        cancelled = true
      }
    }

    const cleanup = fetchPool()

    return () => {
      cancelled = true
      if (cleanup && typeof cleanup.then === 'function') {
        cleanup.then(cleanupFn => cleanupFn && cleanupFn())
      }
    }
  }, [shareId])

  const handleBack = () => {
    window.location.href = '/'
  }

  if (error && !loading && !pool) {
    // Existence is gated server-side (page.tsx calls notFound() → real 404), so
    // reaching here means a genuine load failure (or a pool deleted mid-session),
    // not a missing share. Show the error card, never a scary crash.
    return (
      <div
        className="app"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Couldn&apos;t load this pool</h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', maxWidth: '400px', lineHeight: 1.6 }}>
          Something went wrong loading that sealed pool. Please try again in a moment.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => { window.location.href = '/sealed' }}
          style={{ marginTop: '2rem' }}
        >
          Back to Sealed
        </Button>
      </div>
    )
  }

  const getInitialPacks = () => {
    if (loading) return null
    if (pool?.packs && pool.packs.length > 0) {
      return pool.packs
    }
    if (pool?.cards && pool.cards.length > 0) {
      return [{ cards: pool.cards }]
    }
    return null
  }

  // Extract pool name from deckBuilderState (source of truth) or fall back to pool.name
  const getPoolName = () => {
    if (pool?.deckBuilderState) {
      const state = typeof pool.deckBuilderState === 'string'
        ? JSON.parse(pool.deckBuilderState)
        : pool.deckBuilderState
      if (state.poolName) return state.poolName
    }
    return pool?.name || null
  }
  const getIsDefaultName = (): boolean => {
    if (!pool?.deckBuilderState) return false
    const state = typeof pool.deckBuilderState === 'string'
      ? JSON.parse(pool.deckBuilderState)
      : pool.deckBuilderState
    return state?.isDefaultName === true
  }

  const isOwner = Boolean(user && pool && (user.id === pool.owner?.id || user.id === pool.userId))
  const rootShareId = pool?.parentShareId || pool?.shareId
  const isChildBuild = Boolean(pool?.parentShareId)

  return (
    <div className="app">
      <SealedPod
        setCode={pool?.setCode}
        setName={pool?.setName}
        poolType="sealed"
        poolName={getPoolName()}
        createdAt={pool?.createdAt}
        onBack={handleBack}
        onBuildDeck={(cards: CardType[], setCode: string) => {
          window.location.href = `/pool/${shareId}/deck`
        }}
        initialPacks={getInitialPacks()}
        shareId={pool?.shareId}
        isLoading={loading}
        poolOwnerId={pool?.owner?.id || pool?.userId}
        poolOwnerUsername={pool?.owner?.username || null}
        isDefaultName={getIsDefaultName()}
      />
      {!loading && rootShareId && (
        <PoolBuilds
          shareId={rootShareId}
          currentUserId={user?.id || null}
          isOwner={isOwner && !isChildBuild}
        />
      )}
    </div>
  )
}
