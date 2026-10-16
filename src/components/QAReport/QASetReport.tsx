'use client'

import ContentSkeleton from '@/src/components/ContentSkeleton'
import { MetaEmpty } from '@/src/components/Meta/MetaBits'
import { useCachedJson } from '@/src/hooks/useCachedJson'
import type { PackQualityData } from '@/src/services/packQualityService'
import { healthStatus, worstStatus, metricStatus, structuralStatus, type QATestGroup } from '@/src/services/qaReport'
import { QAKpi } from './QABits'
import { QAFoilDistribution, QARateValidation } from './QARates'
import { QAStructure } from './QAStructure'
import { QADuplicates } from './QADuplicates'
import { QAPacks } from './QAPacks'

interface GenerationStats { cards?: unknown[]; totalPools: number; draftPools: number; sealedPools: number; totalPacks: number; totalCards: number }

export type QASetView = 'quality' | 'packs'

function HealthStrip({ gen, quality, tests }: { gen: GenerationStats; quality: PackQualityData | null; tests: QATestGroup | undefined }) {
  const structural = quality?.structuralMetrics || []
  const structPass = structural.filter((m) => m.status === 'pass').length
  const rates = quality ? [
    quality.rarityMetrics.legendaryRate, ...Object.values(quality.treatmentMetrics),
    ...Object.values(quality.rarityMetrics.foilRarityDistribution),
  ].filter(Boolean) : []
  return (
    <div className="qar-kpis">
      <QAKpi value={(quality?.sampleSize.totalPacks ?? gen.totalPacks).toLocaleString()} label="Packs"
        note={`${gen.totalPools.toLocaleString()} pools (${gen.draftPools.toLocaleString()} draft, ${gen.sealedPools.toLocaleString()} sealed)`} />
      {quality && (
        <>
          <QAKpi value={`${quality.overallHealth.score}%`} label="Quality Score" status={healthStatus(quality.overallHealth.status)} />
          <QAKpi value={quality.overallHealth.metricsWithinExpected} of={quality.overallHealth.totalMetrics} label="Rates in Tolerance"
            status={worstStatus(rates.map((m) => metricStatus(m.status)))} />
          <QAKpi value={structPass} of={structural.length} label="Structure" status={worstStatus(structural.map((m) => structuralStatus(m.status)))} />
        </>
      )}
      <QAKpi value={tests?.passed ?? 0} of={tests?.tests.length ?? 0} label="Tests Passing" status={tests?.status ?? 'none'} note="latest QA run" />
    </div>
  )
}

/** One set's QA: health strip, then rates, foils, structure and duplicates, or the packs evidence. */
export function QASetReport({ setCode, since, view, tests }: { setCode: string; since: string; view: QASetView; tests: QATestGroup | undefined }) {
  const q = `setCode=${encodeURIComponent(setCode)}&since=${encodeURIComponent(since)}`
  const gen = useCachedJson<GenerationStats>(`/api/stats/generations?${q}`)
  const quality = useCachedJson<PackQualityData>(`/api/public/pack-quality?${q}`)

  if (gen.loading && !gen.data) {
    return <div className="mstats-stack"><ContentSkeleton kind="control" count={5} /><ContentSkeleton kind="row" count={4} /></div>
  }
  if (gen.error) return <MetaEmpty>QA data couldn&apos;t be loaded for {setCode}.</MetaEmpty>
  const stats = gen.data
  if (!stats || !stats.cards || stats.cards.length === 0) {
    return <MetaEmpty>No generation data for {setCode} yet. Statistics appear after packs are generated.</MetaEmpty>
  }

  return (
    <div className="mstats-stack">
      {quality.loading && !quality.data ? <ContentSkeleton kind="control" count={5} /> : <HealthStrip gen={stats} quality={quality.data} tests={tests} />}
      {stats.totalPacks < 10 && <p className="mstats-note">Small sample: statistics may not be reliable until more packs are generated.</p>}
      {view === 'packs' ? <QAPacks setCode={setCode} since={since} /> : (
        <>
          {quality.loading && !quality.data ? <ContentSkeleton kind="row" count={4} /> : !quality.data ? (
            <MetaEmpty>No quality data for {setCode} yet.</MetaEmpty>
          ) : (
            <>
              <div className="mstats-two mstats-two--even">
                <QARateValidation data={quality.data} />
                <QAFoilDistribution data={quality.data} />
              </div>
              <QAStructure data={quality.data} />
            </>
          )}
          <QADuplicates setCode={setCode} />
          {quality.data && <p className="mstats-note">Data generated {new Date(quality.data.generatedAt).toLocaleString()}.</p>}
        </>
      )}
    </div>
  )
}
