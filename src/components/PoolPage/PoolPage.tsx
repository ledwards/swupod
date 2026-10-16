'use client'
import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import { SiteTitle } from '../SiteTheme'
import { loadPool } from '../../utils/poolApi'
import { useTrackPoolView } from '../../hooks/useTrackPoolView'
import { poolPacks, type PoolPack } from '../../services/pools/poolPage'
import PoolView from './PoolView'
import './pool-page.css'

interface LoadedPool {
  shareId: string
  setCode: string
  cards?: PoolPack['cards']
  packs?: PoolPack[]
  poolType?: string
  deckBuilderState?: string | { poolName?: string } | null
  createdAt?: string
  name?: string | null
  owner?: { id: string; username?: string | null } | null
  userId?: string
  draftShareId?: string | null
  parentShareId?: string | null
}

const parseState = (s: LoadedPool['deckBuilderState']) => (typeof s === 'string' ? JSON.parse(s) : s) as { poolName?: string } | null | undefined

/**
 * /pools/[shareId] for alpha viewers: loads the pool (with a few retries for a
 * pool saved a moment ago) and shows it with PoolView. Draft and sealed pools
 * share the page; the server already knows which this is.
 */
export default function PoolPage({ shareId, poolType }: { shareId: string; poolType: 'sealed' | 'draft' }) {
  const [pool, setPool] = useState<LoadedPool | null>(null)
  const [error, setError] = useState<string | null>(null)
  useTrackPoolView(shareId)

  useEffect(() => {
    let cancelled = false
    // Draft pools are written as the draft ends, so they get a longer grace period.
    const maxRetries = poolType === 'draft' ? 5 : 2
    const attempt = async (retries: number): Promise<void> => {
      try {
        const data = await loadPool(shareId) as unknown as LoadedPool
        if (!cancelled) { setPool(data); setError(null) }
      } catch (err) {
        if (cancelled) return
        const missing = err instanceof Error && err.message.includes('not found')
        if (missing && retries < maxRetries) {
          await new Promise(r => setTimeout(r, poolType === 'draft' ? 1000 * (retries + 1) : 500))
          return attempt(retries + 1)
        }
        setError(err instanceof Error ? err.message : 'Failed to load pool')
      }
    }
    void attempt(0)
    return () => { cancelled = true }
  }, [shareId, poolType])

  const packs = useMemo(() => (pool ? poolPacks({ poolType, packs: pool.packs ?? null, cards: pool.cards ?? null }) : null), [pool, poolType])

  if (error && !pool) return (
    <div className="ppg-page">
      <SiteTitle>Couldn’t Load This Pool</SiteTitle>
      <main className="ppg-content">
        <section className="ppg-panel ppg-empty" aria-label="Pool unavailable">
          <p role="alert">Something went wrong loading this pool. Please try again in a moment.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>Try Again</Button>
        </section>
      </main>
    </div>
  )

  const state = pool?.deckBuilderState ? parseState(pool.deckBuilderState) : null
  return (
    <PoolView
      shareId={pool?.shareId ?? null}
      setCode={pool?.setCode ?? ''}
      poolType={poolType}
      poolName={state?.poolName || pool?.name || null}
      createdAt={pool?.createdAt ?? null}
      ownerId={pool?.owner?.id || pool?.userId || null}
      ownerUsername={pool?.owner?.username || null}
      draftShareId={pool?.draftShareId || null}
      packs={packs}
      buildsShareId={pool ? pool.parentShareId || pool.shareId : null}
    />
  )
}
