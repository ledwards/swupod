'use client'
import { useMemo } from 'react'
import Button from '../Button'
import ContentSkeleton from '../ContentSkeleton'
import PackOpeningAnimation, { type PackOpeningAnimationProps } from '../PackOpeningAnimation'
import { SiteTitle } from '../SiteTheme'
import PoolView from '../PoolPage/PoolView'
import { poolPacks } from '../../services/pools/poolPage'
import { getSetConfig } from '../../utils/setConfigs'
import { usePoolOpening } from './usePoolOpening'
import '../PoolPage/pool-page.css'

/**
 * /pools/new (alpha): open a sealed pool's packs, then see the pool. The
 * opening is the shared PackOpeningAnimation (Shuffle Packs, Open All, Skip);
 * the pool afterwards is the themed pool page.
 */
export default function PoolsNew() {
  const o = usePoolOpening()
  const packs = useMemo(() => (o.pool ? poolPacks({ poolType: 'sealed', packs: o.pool.packs }) : null), [o.pool])
  const setName = o.setCode ? getSetConfig(o.setCode)?.setName || o.setCode : null

  // Wait for the set art before the first paint so the packs never flash the default image.
  if (o.opening && o.setCode && o.packImageUrls.length > 0) {
    return (
      <>
        <SiteTitle subtitle={`${o.packCount} packs from one booster box`}>{setName ? `${setName} Sealed` : 'Sealed'}</SiteTitle>
        <PackOpeningAnimation packCount={o.packCount} packImageUrls={o.packImageUrls} cardBackUrl="/card-images/card-back.png"
          onComplete={() => void o.finish()} setCode={o.setCode} packs={(o.pool?.packs ?? null) as Exclude<PackOpeningAnimationProps['packs'], undefined>} onRandomize={o.shuffle}
          hasBox={Boolean(o.pool?.boxPacks)}/>
      </>
    )
  }

  if (o.error) return (
    <div className="ppg-page">
      <SiteTitle>Couldn’t Open This Pool</SiteTitle>
      <main className="ppg-content">
        <section className="ppg-panel ppg-empty" aria-label="Pool unavailable">
          <p role="alert">{o.error}</p>
          {o.pool?.generationId && <Button variant="primary" onClick={() => void o.finish()}>Retry Saving Pool</Button>}
        </section>
      </main>
    </div>
  )

  if (o.busy || !o.pool) return (
    <div className="ppg-page" aria-busy="true">
      <SiteTitle>{setName ? `${setName} Sealed` : 'Sealed'}</SiteTitle>
      <main className="ppg-content">
        <section className="ppg-panel" aria-label="Packs"><ContentSkeleton kind="card" count={14}/></section>
      </main>
    </div>
  )

  return (
    <PoolView shareId={o.pool.shareId} setCode={o.pool.setCode} poolType="sealed" poolName={null}
      createdAt={o.pool.createdAt ?? null} ownerId={null} ownerUsername={o.pool.owner?.username ?? null} packs={packs}/>
  )
}
