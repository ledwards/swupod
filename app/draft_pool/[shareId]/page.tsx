// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import SealedPod from '../../../src/components/SealedPod'
import PoolBuilds from '../../../src/components/PoolBuilds'
import { loadPool } from '../../../src/utils/poolApi'
import { useAuth } from '../../../src/contexts/AuthContext'
import '../../../src/App.css'

interface CardType {
  id?: string
  name?: string
  type?: string
  isLeader?: boolean
  [key: string]: unknown
}

interface PackType {
  name?: string
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
  draftShareId?: string
  parentShareId?: string | null
  buildCount?: number
}

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function DraftPoolPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const { user } = useAuth()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)

  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  useEffect(() => {
    let cancelled = false

    async function fetchPool() {
      if (!shareId) return

      let retries = 0
      const maxRetries = 5

      const attemptLoad = async (): Promise<boolean> => {
        if (cancelled) return false

        try {
          setLoading(true)
          const poolData = await loadPool(shareId)

          if (cancelled) return false

          // Redirect to sealed_pool if this is actually a sealed pool
          if (poolData.poolType === 'sealed') {
            window.location.href = `/sealed_pool/${shareId}`
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
            await new Promise(resolve => setTimeout(resolve, 1000 * retries))
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

  useEffect(() => {
    if (error && !loading && !pool) {
      const timer = setTimeout(() => {
        window.location.href = '/draft'
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [error, loading, pool])

  const handleBack = () => {
    if (pool?.draftShareId) {
      window.location.href = `/draft/${pool.draftShareId}`
    } else {
      window.location.href = '/draft'
    }
  }

  if (error && !loading && !pool) {
    return (
      <div className="app">
        <div className="loading"></div>
      </div>
    )
  }

  // For draft pools, separate leaders and split cards into packs
  const getInitialPacks = (): PackType[] | null => {
    if (loading) return null

    // Collect all cards from either packs or flat cards array
    let allCards: CardType[] = []

    if (pool?.packs && pool.packs.length > 0) {
      // Extract all cards from existing packs
      allCards = pool.packs.flatMap(pack => pack.cards || [])
    } else if (pool?.cards && pool.cards.length > 0) {
      allCards = pool.cards
    }

    if (allCards.length === 0) return null

    // Always separate leaders from pack cards
    const leaders = allCards.filter(c => c.isLeader || c.type === 'Leader')
    const packCards = allCards.filter(c => !c.isLeader && c.type !== 'Leader')

    // Split pack cards into 3 packs of 14
    const pack1 = packCards.slice(0, 14)
    const pack2 = packCards.slice(14, 28)
    const pack3 = packCards.slice(28, 42)

    const packs: PackType[] = []
    if (leaders.length > 0) {
      packs.push({ name: 'Leaders', cards: leaders })
    }
    if (pack1.length > 0) {
      packs.push({ name: 'Round 1', cards: pack1 })
    }
    if (pack2.length > 0) {
      packs.push({ name: 'Round 2', cards: pack2 })
    }
    if (pack3.length > 0) {
      packs.push({ name: 'Round 3', cards: pack3 })
    }
    return packs
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

  const isOwner = Boolean(user && pool && (user.id === pool.owner?.id || user.id === pool.userId))
  const rootShareId = pool?.parentShareId || pool?.shareId
  const isChildBuild = Boolean(pool?.parentShareId)

  return (
    <div className="app">
      <SealedPod
        setCode={pool?.setCode}
        setName={pool?.setName}
        poolType="draft"
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
        draftShareId={pool?.draftShareId || null}
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
