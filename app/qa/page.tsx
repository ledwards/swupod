// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import './qa.css'
import { STATS_SET_ORDER, STATS_SET_COLORS } from '@/src/utils/statsSetTabs'
import duplicateStats from '@/src/data/duplicateStats.json'

// Client-side caches so switching tabs doesn't refetch the same (DB-heavy) data.
const genCache = new Map<string, Stats>()
const qualityCache = new Map<string, QualityData>()

interface Treatment {
  isApplicable?: boolean
  observed: number
  expected: number
  percentDiff: number
  zScore: number
  significance: {
    status: string
    color: string
    description: string
  }
}

interface CardAnalysis {
  base?: Treatment
  hyperspace?: Treatment
  foil?: Treatment
  hyperspace_foil?: Treatment
  showcase?: Treatment
}

interface CardStats {
  cardId: string
  name: string
  subtitle?: string
  type: string
  aspects?: string[]
  analysis?: CardAnalysis
}

interface PoolMetrics {
  totalPools?: number
  poolsAffected?: number
  samples?: Array<{
    card: string
    treatment?: string
    treatments?: string[]
    count?: number
  }>
}

interface PackMetrics {
  treatmentDistribution?: Record<string, number>
  rarityDistribution?: Record<string, number>
  packSameTreatmentDuplicates?: PoolMetrics & { packsAffected?: number }
  packCrossTreatmentDuplicates?: PoolMetrics & { packsAffected?: number }
  poolSameTreatmentDuplicates?: PoolMetrics
  poolCrossTreatmentDuplicates?: PoolMetrics
  totalPacksTracked?: number
}

interface Stats {
  cards: CardStats[]
  totalPools: number
  draftPools: number
  sealedPools: number
  totalPacks: number
  totalCards: number
  packMetrics?: PackMetrics
  debug?: {
    rawGenerationsCount?: number
    treatmentCounts?: Record<string, number>
    unmatchedCardsCount?: number
    unmatchedSamples?: Array<{ name: string }>
  }
}

interface PackCard {
  cardId: string
  name: string
  subtitle?: string
  type?: string
  rarity?: string
  treatment: string
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
  imageUrl?: string
}

interface Pack {
  sourceId: string
  sourceType: string
  packIndex: number
  cards: PackCard[]
}

interface QATest {
  name: string
  suite: string
  status: 'passed' | 'failed'
  executionTime?: number
  errorMessage?: string
}

interface QAResults {
  available: boolean
  latestRun?: {
    summary: {
      total: number
      passed: number
      failed: number
    }
    runAt: string
    tests: QATest[]
  }
}

// Stats start date
const STATS_START_DATE = process.env.NEXT_PUBLIC_STATS_START_DATE || '2026-02-12'

// Format numbers with commas
const fmt = (n: number) => n.toLocaleString()

export default function QAPage() {
  const [activeTab, setActiveTab] = useState(STATS_SET_ORDER[0]) // latest set (ASH)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const formattedDate = new Date(STATS_START_DATE).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash) setActiveTab(hash)
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash) setActiveTab(hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    window.location.hash = tab
  }

  useEffect(() => {
    if (activeTab === 'Reference' || activeTab === 'Overall') {
      setLoading(false)
      return
    }

    const cached = genCache.get(activeTab)
    if (cached) { setStats(cached); setLoading(false); return }

    setLoading(true)
    fetch(`/api/stats/generations?setCode=${activeTab}&since=${STATS_START_DATE}`)
      .then(res => res.json())
      .then(response => {
        const data = response.data || response
        genCache.set(activeTab, data)
        setStats(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [activeTab])

  // Reference + Overall first, then every set newest-first (includes pre-release sets like ASH)
  const tabs = ['Reference', 'Overall', ...STATS_SET_ORDER]
  const setColors: Record<string, string> = STATS_SET_COLORS

  return (
    <div className="qa-page">
      <div className="qa-page-header">
        <h1>QA</h1>
        <p>Pack generation quality assurance</p>
        <h3 className="qa-date-range">Since {formattedDate}</h3>
      </div>

      <div className="stats-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`stats-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => handleTabChange(tab)}
            style={setColors[tab] ? {
              '--set-color': setColors[tab],
              ...(activeTab === tab ? {
                backgroundColor: setColors[tab],
                borderBottomColor: setColors[tab]
              } : {})
            } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="stats-content">
        {activeTab === 'Reference' ? (
          <ReferenceTab />
        ) : activeTab === 'Overall' ? (
          <QAOverallTab />
        ) : loading ? (
          <div className="stats-loading-skeleton">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {['Packs', 'Quality'].map(label => (
                <div key={label} className="skeleton-block" style={{ width: '80px', height: '32px' }} />
              ))}
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div className="skeleton-line" style={{ width: '200px', height: '1.1rem', marginBottom: '1rem' }} />
            </div>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="skeleton-row">
                <div className="skeleton-line" style={{ maxWidth: '140px' }} />
                <div className="skeleton-line" style={{ maxWidth: '80px' }} />
                <div className="skeleton-line" style={{ maxWidth: '60px' }} />
                <div className="skeleton-line" style={{ maxWidth: '60px' }} />
                <div className="skeleton-line" style={{ maxWidth: '60px' }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="stats-error">Error: {error}</div>
        ) : (
          <QASetTab stats={stats} setCode={activeTab} />
        )}
      </div>
    </div>
  )
}

interface QASetTabProps {
  stats: Stats | null
  setCode: string
}

function QASetTab({ stats, setCode }: QASetTabProps) {
  const [subTab, setSubTab] = useState('quality')
  const [qualityData, setQualityData] = useState<QualityData | null>(null)
  const [qualityLoading, setQualityLoading] = useState(true)

  useEffect(() => {
    const cached = qualityCache.get(setCode)
    if (cached) { setQualityData(cached); setQualityLoading(false); return }
    setQualityLoading(true)
    fetch(`/api/public/pack-quality?setCode=${setCode}&since=${STATS_START_DATE}`)
      .then(r => r.json())
      .then(result => {
        if (result.data) {
          qualityCache.set(setCode, result.data)
          setQualityData(result.data)
        }
      })
      .catch(err => {
        console.error('Error fetching quality data:', err)
      })
      .finally(() => setQualityLoading(false))
  }, [setCode])

  if (!stats || !stats.cards || stats.cards.length === 0) {
    return (
      <div className="stats-empty">
        <p>No generation data available for {setCode} yet.</p>
        <p>Statistics will appear after packs are generated.</p>
      </div>
    )
  }

  const hasEnoughData = stats.totalPacks >= 10

  return (
    <div className="generation-stats">
      <div className="stats-summary">
        <h2>{setCode} QA</h2>
        <div className="stats-summary-grid">
          <div className="stat-item">
            <span className="stat-label">Pools:</span>
            <span className="stat-value">{fmt(stats.totalPools)}</span>
            <span className="stat-detail">({fmt(stats.draftPools)} draft, {fmt(stats.sealedPools)} sealed)</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Packs:</span>
            <span className="stat-value">{fmt(stats.totalPacks)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Cards Tracked:</span>
            <span className="stat-value">{fmt(stats.totalCards)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Unique Cards:</span>
            <span className="stat-value">{fmt(stats.cards.length)}</span>
          </div>
        </div>
        {!hasEnoughData && (
          <p className="stats-warning">
            Warning: Small sample size - statistics may not be reliable yet. Generate more packs for better accuracy.
          </p>
        )}
      </div>

      <div className="stats-subtabs">
        <button
          className={`stats-subtab ${subTab === 'quality' ? 'active' : ''}`}
          onClick={() => setSubTab('quality')}
        >
          Quality
        </button>
        <button
          className={`stats-subtab ${subTab === 'duplicates' ? 'active' : ''}`}
          onClick={() => setSubTab('duplicates')}
        >
          Duplicates
        </button>
        <button
          className={`stats-subtab ${subTab === 'packs' ? 'active' : ''}`}
          onClick={() => setSubTab('packs')}
        >
          Packs
        </button>
      </div>

      {subTab === 'quality' ? (
        <QualitySubTab data={qualityData} loading={qualityLoading} />
      ) : subTab === 'duplicates' ? (
        <DuplicatesSubTab setCode={setCode} />
      ) : (
        <PacksSubTab setCode={setCode} />
      )}
    </div>
  )
}

// === PacksSubTab ===

interface PacksSubTabProps {
  setCode: string
}

interface PoolGroup {
  sourceId: string
  sourceType: string
  packs: Pack[]
}

interface LegendaryInfo {
  name: string
  treatment: string
}

interface AnyDuplicateInfo {
  name: string
  count: number
  treatments: string[]
}

interface PoolStats {
  baseDuplicates: { name: string; count: number }[]
  anyDuplicates: AnyDuplicateInfo[]
  legendaries: LegendaryInfo[]
  hyperspaceLeaders: number
  hyperspaceBases: number
  hyperspaceOther: number
}

function getTreatmentLabel(card: PackCard): string {
  if (card.isShowcase) return 'showcase'
  if (card.isHyperspace && card.isFoil) return 'hyperspace foil'
  if (card.isHyperspace) return 'hyperspace'
  if (card.isFoil) return 'foil'
  return 'regular'
}

function getPoolStats(packs: Pack[]): PoolStats {
  const allCards = packs.flatMap(p => p.cards)

  const normalCards = allCards.filter(c =>
    !c.isFoil && !c.isHyperspace && !c.isShowcase && c.type !== 'Leader' && c.type !== 'Base'
  )
  const baseNameCounts = new Map<string, number>()
  normalCards.forEach(c => {
    baseNameCounts.set(c.name, (baseNameCounts.get(c.name) || 0) + 1)
  })
  const baseDuplicates = Array.from(baseNameCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const nonLeaderBase = allCards.filter(c => c.type !== 'Leader' && c.type !== 'Base')
  const nameGroups = new Map<string, { count: number; treatments: Set<string> }>()
  nonLeaderBase.forEach(c => {
    if (!nameGroups.has(c.name)) {
      nameGroups.set(c.name, { count: 0, treatments: new Set() })
    }
    const group = nameGroups.get(c.name)!
    group.count++
    group.treatments.add(getTreatmentLabel(c))
  })
  const anyDuplicates: AnyDuplicateInfo[] = Array.from(nameGroups.entries())
    .filter(([, data]) => data.count > 1)
    .map(([name, data]) => ({ name, count: data.count, treatments: Array.from(data.treatments).sort() }))
    .sort((a, b) => b.count - a.count)

  const legendaries = allCards
    .filter(c => c.rarity === 'Legendary')
    .map(c => {
      let treatment = ''
      if (c.isShowcase) treatment = 'showcase'
      else if (c.isHyperspace && c.isFoil) treatment = 'hyperspace foil'
      else if (c.isHyperspace) treatment = 'hyperspace'
      else if (c.isFoil) treatment = 'foil'
      return { name: c.name, treatment }
    })

  const hsCards = allCards.filter(c => c.isHyperspace)
  const hyperspaceLeaders = hsCards.filter(c => c.type === 'Leader').length
  const hyperspaceBases = hsCards.filter(c => c.type === 'Base').length
  const hyperspaceOther = hsCards.filter(c => c.type !== 'Leader' && c.type !== 'Base').length

  return { baseDuplicates, anyDuplicates, legendaries, hyperspaceLeaders, hyperspaceBases, hyperspaceOther }
}

function getStatColor(value: number, expected: number, stdDev: number): string {
  const z = Math.abs(value - expected) / (stdDev || 1)
  if (z > 3) return '#ff4444'
  if (z > 2) return '#ffaa00'
  return '#44ff44'
}

function PacksSubTab({ setCode }: PacksSubTabProps) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const limit = 60

  useEffect(() => {
    setLoading(true)
    setOffset(0)
    fetch(`/api/stats/packs?setCode=${setCode}&limit=${limit}&offset=0&since=${STATS_START_DATE}`)
      .then(res => res.json())
      .then(response => {
        const data = response.data || response
        setPacks(data.packs || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading packs:', err)
        setLoading(false)
      })
  }, [setCode])

  const loadMore = () => {
    const newOffset = offset + limit
    setLoading(true)
    fetch(`/api/stats/packs?setCode=${setCode}&limit=${limit}&offset=${newOffset}&since=${STATS_START_DATE}`)
      .then(res => res.json())
      .then(response => {
        const data = response.data || response
        setPacks(prev => [...prev, ...(data.packs || [])])
        setOffset(newOffset)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading more packs:', err)
        setLoading(false)
      })
  }

  const poolGroups: PoolGroup[] = useMemo(() => {
    const groups = new Map<string, PoolGroup>()
    packs.forEach(pack => {
      if (!groups.has(pack.sourceId)) {
        groups.set(pack.sourceId, {
          sourceId: pack.sourceId,
          sourceType: pack.sourceType,
          packs: []
        })
      }
      groups.get(pack.sourceId)!.packs.push(pack)
    })
    groups.forEach(group => {
      group.packs.sort((a, b) => a.packIndex - b.packIndex)
    })
    return Array.from(groups.values())
  }, [packs])

  if (loading && packs.length === 0) {
    return (
      <div className="stats-loading-skeleton">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-line" style={{ maxWidth: '100px' }} />
            <div className="skeleton-line" style={{ maxWidth: '200px' }} />
            <div className="skeleton-line" style={{ maxWidth: '80px' }} />
          </div>
        ))}
      </div>
    )
  }

  if (packs.length === 0) {
    return (
      <div className="stats-empty">
        <p>No pack data available for {setCode} yet.</p>
        <p>Pack contents will appear after packs are generated.</p>
      </div>
    )
  }

  const pluralize = (count: number, singular: string, plural: string) => count === 1 ? singular : plural

  return (
    <div className="packs-subtab">
      <div className="packs-summary">
        <p>Showing {fmt(packs.length)} packs in {fmt(poolGroups.length)} pools (of {fmt(total)} total packs)</p>
      </div>
      <div className="pools-grid">
        {poolGroups.map(pool => {
          const stats = getPoolStats(pool.packs)
          const numPacks = pool.packs.length
          const expectedBaseDups = numPacks === 6 ? 1.0 : 0.5
          const expectedAnyDups = numPacks === 6 ? 3.7 : 1.8
          const expectedLegendary = numPacks * 0.125
          const expectedHS = numPacks * 0.5

          const baseDupCount = stats.baseDuplicates.reduce((sum, d) => sum + d.count - 1, 0)
          const anyDupCount = stats.anyDuplicates.reduce((sum, d) => sum + d.count - 1, 0)
          const totalHS = stats.hyperspaceLeaders + stats.hyperspaceBases + stats.hyperspaceOther

          return (
            <div key={pool.sourceId} className="pool-container">
              <div className="pool-header">
                <span className="pool-type">{pool.sourceType}</span>
                <a href={`/pool/${pool.sourceId}`} className="pool-link" title={`View pool ${pool.sourceId}`}>
                  {pool.sourceId.slice(0, 8)}...
                </a>
              </div>
              <div className="pool-packs-column">
                {pool.packs.map((pack, idx) => (
                  <div key={`${pack.sourceId}-${pack.packIndex}-${idx}`} className="pack-row">
                    <span className="pack-label-inline">{pack.packIndex + 1}</span>
                    <div className="pack-cards-row">
                      {pack.cards.map((card, cardIdx) => {
                        const isBase = card.type === 'Base'
                        const isLeader = card.type === 'Leader'
                        return (
                          <div
                            key={`${card.cardId}-${cardIdx}`}
                            className={`pack-card ${card.isFoil ? 'foil' : ''} ${card.isHyperspace ? 'hyperspace' : ''} ${card.isShowcase ? 'showcase' : ''} ${isBase ? 'base' : ''} ${isLeader ? 'leader' : ''}`}
                            title={`${card.name}${card.subtitle ? ` - ${card.subtitle}` : ''} (${card.treatment})`}
                          >
                            {card.imageUrl ? (
                              <img src={card.imageUrl} alt={card.name} className="pack-card-image" />
                            ) : (
                              <div className="pack-card-placeholder">
                                <span className="placeholder-name">{card.name}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pool-stats-block">
                <div className="pool-stat-line">
                  <span className="pool-stat-label" style={{ color: getStatColor(baseDupCount, expectedBaseDups, 0.8) }}>
                    {baseDupCount} {pluralize(baseDupCount, 'Duplicate', 'Duplicates')} (regular treatment):
                  </span>
                  <span className="pool-stat-value">
                    {baseDupCount === 0 ? 'None' : stats.baseDuplicates.map(d => `${d.name} x${d.count}`).join(', ')}
                  </span>
                </div>
                <div className="pool-stat-line">
                  <span className="pool-stat-label" style={{ color: getStatColor(anyDupCount, expectedAnyDups, 1.4) }}>
                    {anyDupCount} {pluralize(anyDupCount, 'Duplicate', 'Duplicates')} (any treatment):
                  </span>
                  <span className="pool-stat-value">
                    {anyDupCount === 0 ? 'None' : stats.anyDuplicates.map(d => `${d.name} x${d.count} (${d.treatments.join(', ')})`).join(', ')}
                  </span>
                </div>
                <div className="pool-stat-line">
                  <span className="pool-stat-label" style={{ color: getStatColor(stats.legendaries.length, expectedLegendary, 0.8) }}>
                    {stats.legendaries.length} {pluralize(stats.legendaries.length, 'Legendary', 'Legendaries')}:
                  </span>
                  <span className="pool-stat-value">
                    {stats.legendaries.length === 0 ? 'None' : stats.legendaries.map(l => l.treatment ? `${l.name} (${l.treatment})` : l.name).join(', ')}
                  </span>
                </div>
                <div className="pool-stat-line">
                  <span className="pool-stat-label" style={{ color: getStatColor(totalHS, expectedHS, 1.5) }}>
                    {totalHS} Hyperspace:
                  </span>
                  <span className="pool-stat-value">
                    {totalHS === 0 ? 'None' : `${stats.hyperspaceLeaders} ${pluralize(stats.hyperspaceLeaders, 'leader', 'leaders')}, ${stats.hyperspaceBases} ${pluralize(stats.hyperspaceBases, 'base', 'bases')}, ${stats.hyperspaceOther} other`}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {packs.length < total && (
        <div className="load-more-container">
          <button className="load-more-button" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading...' : `Load More (${fmt(total - packs.length)} remaining)`}
          </button>
        </div>
      )}
    </div>
  )
}

// === QualitySubTab ===

interface QualityMetricResult {
  observed: number
  expected: number
  observedRate: number
  expectedRate: number
  zScore: number
  status: 'expected' | 'slight_variance' | 'outlier' | 'insufficient_data'
  sampleSize: number
  confidenceInterval: { low: number; high: number }
  displayRate: string
}

interface QualityStructuralMetric {
  metric: string
  passed: number
  failed: number
  rate: number
  status: 'pass' | 'fail' | 'warning'
}

interface QualityChiSquaredResult {
  chiSquared: number
  degreesOfFreedom: number
  pValue: number
  status: 'expected' | 'slight_variance' | 'outlier' | 'insufficient_data'
  interpretation: string
}

interface QualityDuplicateMetric {
  observedMean: number
  observedStdDev: number
  expectedMean: number
  expectedStdDev: number
  zScore: number
  sampleSize: number
  status: 'expected' | 'slight_variance' | 'outlier' | 'insufficient_data'
}

interface QualityDuplicateMetricGroup {
  sampleSize: number
  baseTreatmentDuplicates: QualityDuplicateMetric
  anyTreatmentDuplicates: QualityDuplicateMetric
  baseTreatmentTriplicates: QualityDuplicateMetric
  anyTreatmentTriplicates: QualityDuplicateMetric
}

interface QualityDuplicateMetrics {
  sealedUnshuffled: QualityDuplicateMetricGroup
  sealedShuffled: QualityDuplicateMetricGroup
  draftUnshuffled: QualityDuplicateMetricGroup
  draftShuffled: QualityDuplicateMetricGroup
}

interface QualityData {
  setCode: string
  setName: string
  generatedAt: string
  sampleSize: {
    totalPacks: number
    totalCards: number
    packsWithTracking: number
    dateRange: { start: string; end: string } | null
  }
  overallHealth: {
    score: number
    status: 'excellent' | 'good' | 'acceptable' | 'needs_attention'
    metricsWithinExpected: number
    totalMetrics: number
  }
  structuralMetrics: QualityStructuralMetric[]
  rarityMetrics: {
    legendaryRate: QualityMetricResult
    foilRarityDistribution: Record<string, QualityMetricResult>
    foilDistributionTest: QualityChiSquaredResult
  }
  treatmentMetrics: {
    hyperspaceLeader: QualityMetricResult
    hyperspaceBase: QualityMetricResult
    hyperspaceCommon: QualityMetricResult
    hyperfoil: QualityMetricResult
    showcaseLeader: QualityMetricResult
  }
  duplicateMetrics?: QualityDuplicateMetrics
  reference: {
    packStructure: string
    dataSource: string
  }
}

interface QualitySubTabProps {
  data: QualityData | null
  loading: boolean
}

function QualitySubTab({ data, loading }: QualitySubTabProps) {
  const getStatusBadge = (status: QualityMetricResult['status']) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      expected: { bg: 'rgba(39, 174, 96, 0.2)', color: '#27AE60', label: 'Within Expected' },
      slight_variance: { bg: 'rgba(243, 156, 18, 0.2)', color: '#F39C12', label: 'Slight Variance' },
      outlier: { bg: 'rgba(231, 76, 60, 0.2)', color: '#E74C3C', label: 'Outlier' },
      insufficient_data: { bg: 'rgba(255, 255, 255, 0.1)', color: '#888', label: 'Needs Data' },
    }
    const s = styles[status] || styles.insufficient_data
    return (
      <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

  const getHealthColor = (status: string) => {
    const colors: Record<string, string> = {
      excellent: '#27AE60',
      good: '#2ECC71',
      acceptable: '#F39C12',
      needs_attention: '#E74C3C',
    }
    return colors[status] || '#888'
  }

  const renderMetricRow = (label: string, metric: QualityMetricResult) => (
    <tr key={label}>
      <td>{label}</td>
      <td>{metric.displayRate}</td>
      <td>{formatPercent(metric.observedRate)}</td>
      <td>{fmt(metric.sampleSize)}</td>
      <td style={{ textAlign: 'center' }}>{getStatusBadge(metric.status)}</td>
    </tr>
  )

  if (loading) {
    return (
      <div className="stats-loading-skeleton">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-line" style={{ maxWidth: '160px' }} />
            <div className="skeleton-line" style={{ maxWidth: '80px' }} />
            <div className="skeleton-line" style={{ maxWidth: '80px' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!data) {
    return <div className="stats-empty"><p>No quality data available yet.</p></div>
  }

  return (
    <div className="quality-subtab">
      <div className="qa-summary" style={{ marginBottom: '30px' }}>
        <div className="qa-summary-card">
          <div className="qa-summary-number">{fmt(data.sampleSize.totalPacks)}</div>
          <div className="qa-summary-label">Packs Generated</div>
        </div>
        <div className="qa-summary-card" style={{ borderColor: getHealthColor(data.overallHealth.status) }}>
          <div className="qa-summary-number" style={{ color: getHealthColor(data.overallHealth.status) }}>
            {data.overallHealth.score}%
          </div>
          <div className="qa-summary-label">Quality Score</div>
        </div>
        <div className="qa-summary-card">
          <div className="qa-summary-number">
            {data.overallHealth.metricsWithinExpected}/{data.overallHealth.totalMetrics}
          </div>
          <div className="qa-summary-label">Metrics OK</div>
        </div>
        <div className="qa-summary-card">
          <div className="qa-summary-number">
            {fmt(data.structuralMetrics.filter(m => m.status === 'pass').length)}/{fmt(data.structuralMetrics.length)}
          </div>
          <div className="qa-summary-label">Structure OK</div>
        </div>
      </div>

      <h3>Structural Validation</h3>
      <table className="quality-table" style={{ width: '100%', marginBottom: '30px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Check</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Passed</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Failed</th>
            <th style={{ textAlign: 'center', padding: '8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.structuralMetrics.map(m => (
            <tr key={m.metric} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '8px' }}>{m.metric}</td>
              <td style={{ textAlign: 'right', padding: '8px', color: '#27AE60' }}>{fmt(m.passed)}</td>
              <td style={{ textAlign: 'right', padding: '8px', color: m.failed > 0 ? '#E74C3C' : '#888' }}>{fmt(m.failed)}</td>
              <td style={{ textAlign: 'center', padding: '8px' }}>
                <span style={{
                  background: m.status === 'pass' ? 'rgba(39,174,96,0.2)' : m.status === 'fail' ? 'rgba(231,76,60,0.2)' : 'rgba(255,255,255,0.1)',
                  color: m.status === 'pass' ? '#27AE60' : m.status === 'fail' ? '#E74C3C' : '#888',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                }}>
                  {m.status === 'pass' ? '✓ Pass' : m.status === 'fail' ? '✗ Fail' : 'No Data'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Rate Validation</h3>
      <table className="quality-table" style={{ width: '100%', marginBottom: '30px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Metric</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Expected</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Observed</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Sample</th>
            <th style={{ textAlign: 'center', padding: '8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {renderMetricRow('Legendary Rate', data.rarityMetrics.legendaryRate)}
          {renderMetricRow('Hyperspace Leader', data.treatmentMetrics.hyperspaceLeader)}
          {renderMetricRow('Hyperspace Base', data.treatmentMetrics.hyperspaceBase)}
          {renderMetricRow('Hyperspace Common', data.treatmentMetrics.hyperspaceCommon)}
          {renderMetricRow('Hyperfoil', data.treatmentMetrics.hyperfoil)}
          {renderMetricRow('Showcase Leader', data.treatmentMetrics.showcaseLeader)}
        </tbody>
      </table>

      <h3>Foil Rarity Distribution</h3>
      <table className="quality-table" style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Rarity</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Expected</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Observed</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Sample</th>
            <th style={{ textAlign: 'center', padding: '8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.rarityMetrics.foilRarityDistribution).map(([rarity, metric]) =>
            renderMetricRow(rarity, metric)
          )}
        </tbody>
      </table>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #333', borderRadius: '8px', padding: '16px', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <strong>Foil Distribution Goodness-of-Fit Test</strong>
          {getStatusBadge(data.rarityMetrics.foilDistributionTest.status)}
        </div>
        <p style={{ color: '#888', margin: '0 0 12px', fontSize: '14px' }}>
          {data.rarityMetrics.foilDistributionTest.interpretation}
        </p>
        <div style={{ display: 'flex', gap: '24px', fontFamily: 'monospace', fontSize: '13px', color: '#888' }}>
          <span>&chi;&sup2; = {data.rarityMetrics.foilDistributionTest.chiSquared}</span>
          <span>df = {data.rarityMetrics.foilDistributionTest.degreesOfFreedom}</span>
          <span>p = {data.rarityMetrics.foilDistributionTest.pValue}</span>
        </div>
      </div>

      {/* Duplicate stats moved to the dedicated "Duplicates" sub-tab (variant-neutral,
          from duplicateStats.json). The old cardId-based "any treatment" counts here
          undercounted normal-vs-hyperspace collisions and were removed. */}

      <p style={{ color: '#555', fontSize: '12px', marginTop: '20px' }}>
        Data generated: {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  )
}

// === Duplicates Sub-Tab (variant-neutral, from precomputed duplicateStats.json) ===

const DUP_VERDICT: Record<string, { t: string; c: string }> = {
  consistent: { t: '✓ matches simulation', c: '#16A34A' },
  'minor-drift': { t: '≈ minor drift', c: '#CA8A04' },
  investigate: { t: '⚑ investigate', c: '#DC2626' },
  sparse: { t: 'sparse data', c: '#9aa' },
  'no-data': { t: 'no data yet', c: '#9aa' },
}

function DuplicatesSubTab({ setCode }: { setCode: string }) {
  const s = (duplicateStats as any).sets?.[setCode]
  if (!s) return <div className="stats-empty"><p>No duplicate data for {setCode} yet.</p></div>
  const a = s.sealed6, ac = s.actual?.nonShuffled || {}, sh = s.sealedShuffled, nv = s.naive || {}
  const v = DUP_VERDICT[ac.verdict as string] || DUP_VERDICT['no-data']
  const f2 = (x: number) => (x ?? 0).toFixed(2)
  const td = { padding: '8px' }
  const tdr = { padding: '8px', textAlign: 'right' as const }
  return (
    <div className="qa-duplicates">
      <h3>Duplicate cards per pool — variant-neutral</h3>
      <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
        A foil / hyperspace / prestige printing counts as the same card as its normal version.
      </p>

      <h4 style={{ color: '#aaa' }}>Estimates (6-pack sealed pool)</h4>
      <table className="quality-table" style={{ width: '100%', maxWidth: 620, marginBottom: '24px', borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '1px solid #333' }}>
          <th style={td}>Estimate</th><th style={tdr}>Duplicates / pool</th><th style={td}> </th>
        </tr></thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #222' }}>
            <td style={td}>Actual <span style={{ color: '#888' }}>opened pools{ac.n ? ` · n=${ac.n.toLocaleString()}` : ''}</span></td>
            <td style={tdr}>{ac.n >= 1 && ac.mean != null ? f2(ac.mean) : '—'}</td>
            <td style={td}><span style={{ color: v.c, border: `1px solid ${v.c}`, borderRadius: 999, padding: '1px 8px', fontSize: 12 }}>{v.t}</span></td>
          </tr>
          <tr style={{ borderBottom: '1px solid #222' }}><td style={td}>Simulated <span style={{ color: '#888' }}>live generator</span></td><td style={tdr}>{f2(a.mean)}</td><td /></tr>
          <tr style={{ borderBottom: '1px solid #222' }}><td style={td}>Theoretical <span style={{ color: '#888' }}>variant-collision model</span></td><td style={tdr}>{f2(a.theoryMean)}</td><td /></tr>
          <tr style={{ borderBottom: '1px solid #222', color: '#999' }}><td style={td}>Naive random trials <span style={{ color: '#777' }}>with de-duplication</span></td><td style={tdr}>{nv.dedup != null ? f2(nv.dedup) : '—'}</td><td /></tr>
          <tr style={{ color: '#999' }}><td style={td}>Naive random trials <span style={{ color: '#777' }}>without collation logic</span></td><td style={tdr}>{nv.noDedup != null ? f2(nv.noDedup) : f2(a.naiveMean)}</td><td /></tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px' }}>
          <h4 style={{ color: '#aaa' }}>Where duplicates land</h4>
          <table className="quality-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #333' }}><th style={td}>Card type</th><th style={tdr}>Dups / pool</th><th style={tdr}>Pool</th></tr></thead>
            <tbody>
              {['Leader', 'Base', 'Common', 'Uncommon', 'Rare', 'Legendary', 'Special'].filter(c => (a.byCat?.[c] || 0) > 0.001 || (s.poolSizes?.[c] || 0) > 0).map(c => (
                <tr key={c} style={{ borderBottom: '1px solid #222' }}><td style={td}>{c}</td><td style={tdr}>{f2(a.byCat?.[c] || 0)}</td><td style={{ ...tdr, color: '#777' }}>{s.poolSizes?.[c] || 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ flex: '1 1 280px' }}>
          <h4 style={{ color: '#aaa' }}>What pairing causes each duplicate</h4>
          <table className="quality-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #333' }}><th style={td}>Pairing</th><th style={tdr}>Per pool</th></tr></thead>
            <tbody>
              {Object.entries(a.pair || {}).filter(([, x]: any) => x > 0.01).map(([k, x]: any) => (
                <tr key={k} style={{ borderBottom: '1px solid #222' }}><td style={td}>{k}</td><td style={tdr}>{f2(x)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sh && (
        <>
          <h4 style={{ color: '#aaa', marginTop: '24px' }}>Effect of shuffling packs</h4>
          <table className="quality-table" style={{ width: '100%', maxWidth: 460, borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #222' }}><td style={td}>Not shuffled <span style={{ color: '#888' }}>6 consecutive packs</span></td><td style={tdr}>{f2(a.mean)} <span style={{ color: '#777' }}>σ {f2(a.sd)}</span></td></tr>
              <tr><td style={td}>Shuffled <span style={{ color: '#888' }}>6 packs spread across the box</span></td><td style={tdr}>{f2(sh.mean)} <span style={{ color: '#777' }}>σ {f2(sh.sd)}</span></td></tr>
            </tbody>
          </table>
          <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
            Shuffling pulls 6 packs from across the 24-pack box, outside each belt&apos;s dedup window — duplicates rise ~{(sh.mean / a.mean).toFixed(1)}&times;.
          </p>
        </>
      )}

      <p style={{ color: '#555', fontSize: '12px', marginTop: '20px' }}>
        Variant-neutral (by card name). Naive = random draws ignoring belt collation; even with per-pack
        de-duplication it stays high because most duplicates are cross-pack.{' '}
        {(duplicateStats as any).generatedAt ? `Generated ${(duplicateStats as any).generatedAt}.` : ''}
      </p>
    </div>
  )
}

// === QA Overall Tab ===

function QAOverallTab() {
  const [qaResults, setQaResults] = useState<QAResults | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/stats/qa')
      .then(res => res.json())
      .then(response => {
        setQaResults(response.data || response)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="stats-loading-skeleton">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-line" style={{ maxWidth: '120px' }} />
            <div className="skeleton-line" style={{ maxWidth: '80px' }} />
            <div className="skeleton-line" style={{ maxWidth: '60px' }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="qa-tab">
      <div className="qa-header">
        <h2>QA Test Results</h2>
      </div>

      {!qaResults?.available || !qaResults?.latestRun ? (
        <div className="stats-empty">
          <p>Quality assurance tests have not been run yet.</p>
          <p>Test results will appear here once available.</p>
        </div>
      ) : (
        <div className="qa-results">
          <div className="qa-summary">
            <div className="qa-summary-card">
              <div className="qa-summary-number">{fmt(qaResults.latestRun.summary.total)}</div>
              <div className="qa-summary-label">Total Tests</div>
            </div>
            <div className="qa-summary-card qa-summary-passed">
              <div className="qa-summary-number">{fmt(qaResults.latestRun.summary.passed)}</div>
              <div className="qa-summary-label">Passed</div>
            </div>
            <div className="qa-summary-card qa-summary-failed">
              <div className="qa-summary-number">{fmt(qaResults.latestRun.summary.failed)}</div>
              <div className="qa-summary-label">Failed</div>
            </div>
          </div>

          <div className="qa-test-list">
            <h3>Latest Test Run</h3>
            <p className="qa-run-time">
              Run at: {new Date(qaResults.latestRun.runAt).toLocaleString()}
            </p>

            {qaResults.latestRun.tests.map((test, index) => (
              <div
                key={index}
                className={`qa-test-item qa-test-${test.status}`}
              >
                <div className="qa-test-header">
                  <span className={`qa-test-status qa-status-${test.status}`}>
                    {test.status === 'passed' ? '✓' : '✗'}
                  </span>
                  <span className="qa-test-name">{test.name}</span>
                  <span className="qa-test-suite">{test.suite}</span>
                  {test.executionTime != null && (
                    <span className="qa-test-time">{test.executionTime}ms</span>
                  )}
                </div>
                {test.errorMessage && (
                  <div className="qa-test-error">{test.errorMessage}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// === Reference Tab ===

function ReferenceTab() {
  return (
    <div className="reference-tab">
      <h2>Pack Generation Reference</h2>
      <p className="reference-intro">
        Complete technical documentation of how booster packs are generated in Star Wars: Unlimited.
        This covers universal rules that apply to all sets. For set-specific statistics, see the individual set tabs.
      </p>

      <div className="reference-sections">
        <section className="reference-section reference-full-width">
          <h3>Pack Structure (16 Cards Total)</h3>
          <div className="reference-description">
            <p>Every booster pack contains exactly 16 cards in specific slots:</p>
          </div>
          <table className="reference-table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Count</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Leader</strong></td>
                <td>1</td>
                <td>One leader card from the leader pool. Can upgrade to Hyperspace or Showcase.</td>
              </tr>
              <tr>
                <td><strong>Base</strong></td>
                <td>1</td>
                <td>One base card. Can upgrade to Hyperspace variant.</td>
              </tr>
              <tr>
                <td><strong>Commons</strong></td>
                <td>9</td>
                <td>Nine common cards drawn from alternating aspect belts (A/B pattern). Guarantees all 6 aspects present.</td>
              </tr>
              <tr>
                <td><strong>Uncommons</strong></td>
                <td>2-3</td>
                <td>Two guaranteed uncommons. Third uncommon can upgrade to Rare/Legendary (~18% chance).</td>
              </tr>
              <tr>
                <td><strong>Rare/Legendary</strong></td>
                <td>1-2</td>
                <td>One guaranteed Rare or Legendary. Legendary rate varies by set (see below). Can be 2 if third UC upgrades.</td>
              </tr>
              <tr>
                <td><strong>Foil</strong></td>
                <td>1</td>
                <td>One foil card of any rarity (weighted by set - see below). Can upgrade to Hyperfoil.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="reference-section">
          <h3>Rarity Distribution</h3>
          <div className="reference-description">
            <p><strong>Rare/Legendary Slot (varies by set):</strong></p>
            <ul>
              <li>Sets 1-3: ~14.3% Legendary (6:1 ratio)</li>
              <li>Sets 4+: ~16.7% Legendary (5:1 ratio)</li>
            </ul>
            <p><strong>Third UC Slot Upgrade:</strong></p>
            <ul>
              <li>Sets 1-3: ~18% upgrade rate (1 in 5.5)</li>
              <li>Sets 4+: ~20% upgrade rate (1 in 5)</li>
            </ul>
          </div>
        </section>

        <section className="reference-section">
          <h3>Leader Distribution</h3>
          <div className="reference-description">
            <p>Leaders come in two rarities (Common and Rare), but in the leader slot:</p>
            <ul>
              <li>All leaders have equal probability (uniform distribution)</li>
              <li>Rarity is aesthetic/collectibility, not pull rate</li>
            </ul>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Foil Slot Distribution</h3>
          <div className="reference-description">
            <p>The foil slot uses weighted random selection (weights vary by set):</p>
          </div>
          <table className="reference-table">
            <thead>
              <tr>
                <th>Rarity</th>
                <th>Sets 1-3</th>
                <th>Sets 4-6</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Common</td><td><strong>~78%</strong></td><td><strong>~75%</strong></td></tr>
              <tr><td>Uncommon</td><td><strong>~17%</strong></td><td><strong>~17%</strong></td></tr>
              <tr><td>Rare</td><td><strong>~5%</strong></td><td><strong>~4%</strong></td></tr>
              <tr><td>Legendary</td><td><strong>~0.3%</strong></td><td><strong>~0.3%</strong></td></tr>
              <tr><td>Special</td><td><strong>0%</strong></td><td><strong>~4%</strong></td></tr>
            </tbody>
          </table>
        </section>

        <section className="reference-section reference-full-width">
          <h3>The Belt System</h3>
          <div className="reference-description">
            <p><strong>What are Belts?</strong></p>
            <p>Belts are shuffled pools of cards that ensure proper distribution and prevent immediate duplicates. Each belt contains all eligible cards for that slot, shuffled randomly.</p>
            <p><strong>How Belts Work:</strong></p>
            <ol>
              <li>Cards are organized into belts by slot type (leader, base, common A, common B, uncommon, rare/legendary, foil)</li>
              <li>Each belt is shuffled once at the start</li>
              <li>Cards are drawn sequentially from the belt</li>
              <li>When a belt is exhausted, it&apos;s reshuffled and reused</li>
              <li>This prevents the same card from appearing in consecutive packs</li>
            </ol>
            <p><strong>Common Belts (A &amp; B):</strong></p>
            <ul>
              <li><strong>Belt A</strong>: Vigilance, Command, Heroism aspects</li>
              <li><strong>Belt B</strong>: Aggression, Cunning, Villainy aspects</li>
              <li>Packs alternate drawing from A and B (positions 0,2,4,6,8 vs 1,3,5,7)</li>
              <li>Ensures all 6 aspects appear in every pack&apos;s 9 commons</li>
            </ul>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Upgrade System</h3>
          <div className="reference-description">
            <p>After the base pack is generated, an upgrade pass can replace certain cards with premium versions:</p>
          </div>
          <table className="reference-table">
            <thead>
              <tr>
                <th>Upgrade Type</th>
                <th>Probability</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>Leader &rarr; Showcase</strong></td><td>~0.35%</td><td>Showcase leaders (all sets, ~1 in 288 packs). Takes priority over Hyperspace.</td></tr>
              <tr><td><strong>Leader &rarr; Hyperspace</strong></td><td>~17%</td><td>Hyperspace variant of the leader (1 in 6 packs)</td></tr>
              <tr><td><strong>Base &rarr; Hyperspace</strong></td><td>~25%</td><td>Hyperspace variant of the base (1 in 4 packs)</td></tr>
              <tr><td><strong>Rare &rarr; Hyperspace R/L</strong></td><td>0%</td><td>Rare slot is always standard (black border), never Hyperspace</td></tr>
              <tr><td><strong>3rd UC &rarr; R/L</strong></td><td>~18-20%</td><td>Third uncommon upgrades to rare/legendary (varies by set)</td></tr>
              <tr><td><strong>Foil &rarr; Hyperfoil</strong></td><td>~2%</td><td>Ultra-rare Hyperfoil variant (1 in 50 packs, ~1 per 2 boxes)</td></tr>
              <tr><td><strong>UC 1/2 &rarr; Hyperspace UC</strong></td><td>~12%</td><td>First or second uncommon becomes Hyperspace (1 in 8.5 packs)</td></tr>
              <tr><td><strong>Common &rarr; Hyperspace C</strong></td><td>~33%</td><td>One random common becomes Hyperspace variant (1 in 3 packs)</td></tr>
            </tbody>
          </table>
        </section>

        <section className="reference-section">
          <h3>Hyperspace Variants</h3>
          <div className="reference-description">
            <p><strong>What is Hyperspace?</strong></p>
            <p>Hyperspace variants are alternate versions of cards with different art and a blue border. They&apos;re mechanically identical but visually distinct.</p>
            <p><strong>Hyperspace Sources:</strong></p>
            <ul>
              <li>Upgrade passes (listed above)</li>
              <li>Can appear as regular cards or foils</li>
              <li>Special &quot;Hyperfoil&quot; versions are extremely rare</li>
            </ul>
          </div>
        </section>

        <section className="reference-section">
          <h3>Special Rarity</h3>
          <div className="reference-description">
            <p><strong>Sets 1-3 (Legacy):</strong></p>
            <ul>
              <li>Special rarity cards exist but don&apos;t appear in standard boosters</li>
              <li>8 special cards per set</li>
              <li>Available through other products only</li>
            </ul>
            <p><strong>Sets 4-6:</strong></p>
            <ul>
              <li>Special rarity can appear in the <strong>foil slot only</strong></li>
              <li>Never in regular rare/legendary slot</li>
              <li>12-16 special cards per set</li>
              <li>Same total output rate as Rare (dynamic multiplier scales for card count)</li>
            </ul>
          </div>
        </section>

        <section className="reference-section">
          <h3>Showcase Cards</h3>
          <div className="reference-description">
            <p><strong>What are Showcase Cards?</strong></p>
            <p>Showcase cards are premium variants with special borderless alternate art. They exist in all sets from SOR onwards.</p>
            <p><strong>Showcase Distribution:</strong></p>
            <ul>
              <li>Only leaders can be Showcase</li>
              <li>~0.35% chance (~1 in 288 packs)</li>
              <li>Takes priority over Hyperspace leader upgrade</li>
              <li>Can also appear as foils</li>
            </ul>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Quality Score</h3>
          <div className="reference-description">
            <p>The Quality Score is a percentage representing overall pack generation health:</p>
            <ul>
              <li><strong>Calculation:</strong> (metrics within expected / total metrics) &times; 100</li>
              <li><strong>Excellent (90-100%):</strong> Nearly all metrics pass validation</li>
              <li><strong>Good (75-89%):</strong> Most metrics pass, minor variances acceptable</li>
              <li><strong>Acceptable (60-74%):</strong> Some metrics failing, may need attention</li>
              <li><strong>Needs Attention (&lt;60%):</strong> Significant issues with pack generation</li>
            </ul>
            <p>The score combines structural checks (pass/fail) and rate metrics (statistical tolerance).</p>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Quality Metrics Explained</h3>
          <div className="reference-description">
            <p>The Quality subtab in each set shows automated validation of pack generation. Here&apos;s what each metric measures:</p>
            <p><strong>Structural Validation:</strong></p>
            <ul>
              <li><strong>Pack has exactly 16 cards:</strong> Every pack must contain exactly 16 cards</li>
              <li><strong>Pack has 1 leader:</strong> Exactly one leader card per pack</li>
              <li><strong>Pack has 1 base:</strong> Exactly one base card per pack</li>
              <li><strong>Pack has 9 commons:</strong> Nine common cards (from A/B belts)</li>
              <li><strong>Pack has 1 foil:</strong> Exactly one foil card of any rarity</li>
              <li><strong>All 6 aspects in commons:</strong> The 9 commons must cover all 6 aspects</li>
              <li><strong>No same-treatment duplicates:</strong> No card appears twice with the same treatment</li>
            </ul>
            <p><strong>Rate Validation:</strong></p>
            <ul>
              <li><strong>Legendary Rate:</strong> Sets 1-3: ~14.3% (6:1), Sets 4+: ~16.7% (5:1)</li>
              <li><strong>Hyperspace Leader:</strong> ~17% of leaders should be Hyperspace (1 in 6 packs)</li>
              <li><strong>Hyperspace Base:</strong> ~25% of bases should be Hyperspace (1 in 4 packs)</li>
              <li><strong>Hyperspace Common:</strong> ~33% of packs should have a Hyperspace common (1 in 3)</li>
              <li><strong>Hyperfoil:</strong> ~2% of foils should be Hyperspace Foil variants (1 in 50)</li>
              <li><strong>Showcase Leader:</strong> ~0.35% of leaders should be Showcase (~1 in 288 packs)</li>
            </ul>
            <p><strong>Foil Distribution (Sets 1-3 / Sets 4+):</strong></p>
            <ul>
              <li><strong>Common foils:</strong> Expected ~78% / ~75%</li>
              <li><strong>Uncommon foils:</strong> Expected ~17% / ~17%</li>
              <li><strong>Rare foils:</strong> Expected ~5% / ~4%</li>
              <li><strong>Legendary foils:</strong> Expected ~0.3% / ~0.3%</li>
              <li><strong>Special foils:</strong> Expected 0% / ~4% (Sets 4+ only, same rate as Rare)</li>
            </ul>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Statistical Methods</h3>
          <div className="reference-description">
            <p><strong>Z-Score (Standard Score):</strong></p>
            <p>Measures how many standard deviations an observed value is from the expected value.</p>
            <ul>
              <li>Formula: Z = (observed - expected) / standard_error</li>
              <li>|Z| &lt; 1.96: Within 95% confidence (normal)</li>
              <li>1.96 &lt; |Z| &lt; 2.58: Between 95-99% confidence (outlier)</li>
              <li>|Z| &gt; 2.58: Beyond 99% confidence (extreme outlier)</li>
            </ul>
            <p><strong>Wilson Score Confidence Interval:</strong></p>
            <p>Used for binomial proportions (rate metrics). More accurate than simple intervals for small samples or extreme probabilities.</p>
            <ul>
              <li>Provides upper and lower bounds for the true rate</li>
              <li>If expected rate falls within the confidence interval, the metric passes</li>
              <li>Handles edge cases (0% or 100% observed) better than simpler methods</li>
            </ul>
            <p><strong>Chi-Squared Goodness-of-Fit Test:</strong></p>
            <p>Tests whether an observed distribution matches an expected distribution.</p>
            <ul>
              <li>Used for foil rarity distribution (multiple categories)</li>
              <li>p-value &gt; 0.05: Distribution matches expected (pass)</li>
              <li>p-value &lt; 0.05: Significant deviation from expected (fail)</li>
              <li>Reports degrees of freedom (df) = number of categories - 1</li>
            </ul>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Status Color Coding</h3>
          <div className="reference-description">
            <p>All rate metrics use Z-tests to compare actual vs expected generation rates:</p>
          </div>
          <div className="stats-legend">
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#27AE6040' }}></span>
              <div className="legend-text">
                <strong>Green (Within Expected)</strong>
                <p>Within 95% confidence interval (|Z| &lt; 1.96). Normal statistical variation. No action needed.</p>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#F39C1240' }}></span>
              <div className="legend-text">
                <strong>Yellow (Slight Variance)</strong>
                <p>95-99% confidence interval (1.96 &lt; |Z| &lt; 2.58). Statistically unusual but could be random chance. Worth monitoring.</p>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#E74C3C40' }}></span>
              <div className="legend-text">
                <strong>Red (Outlier)</strong>
                <p>Beyond 99% confidence interval (|Z| &gt; 2.58). Very unlikely to occur by chance. May indicate a bug in pack generation.</p>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#88888840' }}></span>
              <div className="legend-text">
                <strong>Gray (Insufficient Data)</strong>
                <p>Not enough samples for reliable statistics. Generate more packs for accurate results.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Expected Pack Opening Results</h3>
          <div className="reference-description">
            <p><strong>In a typical booster box (24 packs):</strong></p>
            <ul>
              <li><strong>Legendaries:</strong> ~3-4 non-foil + ~0.5 foil = ~4 total (Sets 1-3), ~4-5 total (Sets 4+)</li>
              <li><strong>Rares:</strong> ~20-21 non-foil + ~2 foil = ~22 total</li>
              <li><strong>Hyperfoils:</strong> ~0.5 (about 1 per 2 boxes)</li>
              <li><strong>Showcase Leaders:</strong> ~0.08 per box (~1 per 12 boxes, all sets)</li>
              <li><strong>UC Upgrades:</strong> ~4-5 packs will have 2 rare/legendary</li>
            </ul>
            <p><strong>In a sealed pool (6 packs):</strong></p>
            <ul>
              <li><strong>Legendaries:</strong> ~1 total (0-2 range is normal)</li>
              <li><strong>Rares:</strong> ~5-6 total</li>
              <li><strong>All 6 aspects:</strong> Guaranteed in commons of every pack</li>
              <li><strong>Card+Foil pairs:</strong> 95-99% chance of at least one pair</li>
            </ul>
          </div>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Set-Specific Rules</h3>
          <table className="reference-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Sets 1-3 (SOR/SHD/TWI)</th>
                <th>Sets 4-6 (JTL/LOF/SEC)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>Special Rarity</strong></td><td>Not in boosters</td><td>Foil slot only (same rate as Rare)</td></tr>
              <tr><td><strong>Showcase Leaders</strong></td><td>~0.35% (1 in 288)</td><td>~0.35% (1 in 288)</td></tr>
              <tr><td><strong>Legendary Rate</strong></td><td>~14.3% (6:1 ratio)</td><td>~16.7% (5:1 ratio)</td></tr>
              <tr><td><strong>Hyperfoil Rate</strong></td><td>~2% (1 in 50)</td><td>~2% (1 in 50)</td></tr>
              <tr><td><strong>UC Upgrade Rate</strong></td><td>~18% (1 in 5.5)</td><td>~20% (1 in 5)</td></tr>
              <tr><td><strong>Foil Legendary Weight</strong></td><td>2%</td><td>3%</td></tr>
            </tbody>
          </table>
        </section>

        <section className="reference-section reference-full-width">
          <h3>Technical Notes</h3>
          <div className="reference-description">
            <p><strong>Card Treatments:</strong></p>
            <ul>
              <li><strong>Base:</strong> Normal version of a card (no special treatment)</li>
              <li><strong>Hyperspace:</strong> Blue border alternate art version</li>
              <li><strong>Foil:</strong> Shiny/holographic version (any variant can be foil)</li>
              <li><strong>Hyperspace Foil:</strong> Foil version of Hyperspace variant</li>
              <li><strong>Showcase:</strong> Borderless premium art (leaders only, all sets)</li>
            </ul>
            <p><strong>Duplicate Prevention:</strong></p>
            <ul>
              <li>Same card with same treatment cannot appear twice in one pack</li>
              <li>Different treatments of same card ARE allowed (e.g., normal + foil version)</li>
              <li>Belt system prevents immediate duplicates across consecutive packs</li>
            </ul>
            <p><strong>Aspect Balance:</strong></p>
            <ul>
              <li>All 6 aspects (Vigilance, Command, Aggression, Cunning, Heroism, Villainy) guaranteed in every pack</li>
              <li>Achieved through alternating common belt draws (A/B pattern)</li>
              <li>Belt A: Vigilance, Command, Heroism (positions 0,2,4,6,8)</li>
              <li>Belt B: Aggression, Cunning, Villainy (positions 1,3,5,7)</li>
              <li>9th common position ensures at least one duplicate aspect for deckbuilding</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
