'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import { MetaEmpty, MetaSection } from '@/src/components/Meta/MetaBits'
import { groupPacksByPool, poolEvidence, treatmentLabel, type QAPack, type QAPackCard } from '@/src/services/qaPoolEvidence'
import { QAStatusBadge } from './QAStatusBadge'

const LIMIT = 60

function packsUrl(setCode: string, offset: number, since: string) {
  return `/api/stats/packs?setCode=${encodeURIComponent(setCode)}&limit=${LIMIT}&offset=${offset}&since=${encodeURIComponent(since)}`
}

function PackCard({ card }: { card: QAPackCard }) {
  const landscape = card.type === 'Leader' || card.type === 'Base'
  const title = `${card.name}${card.subtitle ? ` - ${card.subtitle}` : ''} (${treatmentLabel(card)})`
  return (
    <span className={`qar-card${landscape ? ' qar-card--landscape' : ''}${card.isFoil || card.isHyperspace || card.isShowcase ? ' qar-card--variant' : ''}`} title={title}>
      {card.imageUrl ? <img src={card.imageUrl} alt={title} loading="lazy" /> : <span className="qar-card-name">{card.name}</span>}
    </span>
  )
}

/** Generated packs grouped by pool, each pool with its duplicate, legendary and hyperspace evidence. */
export function QAPacks({ setCode, since }: { setCode: string; since: string }) {
  const [packs, setPacks] = useState<QAPack[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = (offset: number) => {
    setLoading(true)
    return fetch(packsUrl(setCode, offset, since))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => {
        const data = body?.data || body
        setPacks((prev) => (offset === 0 ? data.packs || [] : [...prev, ...(data.packs || [])]))
        setTotal(data.total || 0)
        setError(false)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setPacks([])
    void load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCode, since])

  const pools = useMemo(() => groupPacksByPool(packs), [packs])

  if (loading && packs.length === 0) return <ContentSkeleton kind="row" count={4} />
  if (error && packs.length === 0) return <MetaEmpty>Pack data couldn&apos;t be loaded for {setCode}.</MetaEmpty>
  if (packs.length === 0) return <MetaEmpty>No pack data for {setCode} yet. Pack contents appear once packs are generated.</MetaEmpty>

  return (
    <MetaSection title="Packs" subtitle={`Showing ${packs.length.toLocaleString()} packs in ${pools.length.toLocaleString()} pools, of ${total.toLocaleString()} packs.`}>
      <div className="qar-pools">
        {pools.map((pool) => (
          <section key={pool.sourceId} className="mstats-panel qar-pool" aria-label={`${pool.sourceType} pool ${pool.sourceId.slice(0, 8)}`}>
            <div className="qar-pool-head">
              <span className="qar-pool-type">{pool.sourceType}</span>
              <a href={`/pools/${pool.sourceId}`}>Pool {pool.sourceId.slice(0, 8)}</a>
            </div>
            <div className="qar-pool-packs">
              {pool.packs.map((pack, idx) => (
                <div key={`${pack.sourceId}-${pack.packIndex}-${idx}`} className="qar-pack">
                  <span className="qar-pack-num">{pack.packIndex + 1}</span>
                  <div className="qar-pack-cards">
                    {pack.cards.map((card, i) => <PackCard key={`${card.cardId}-${i}`} card={card} />)}
                  </div>
                </div>
              ))}
            </div>
            <ul className="qar-evidence">
              {poolEvidence(pool.packs).map((line) => (
                <li key={line.key}>
                  <QAStatusBadge status={line.status} />
                  <span className="qar-evidence-label">{line.label}</span>
                  <span className="mstats-muted">{line.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {loading && <ContentSkeleton kind="row" count={2} />}
      {packs.length < total && (
        <div className="qar-more">
          <Button variant="secondary" onClick={() => void load(packs.length)} disabled={loading} aria-busy={loading}>
            Load More ({(total - packs.length).toLocaleString()} remaining)
          </Button>
        </div>
      )}
    </MetaSection>
  )
}
