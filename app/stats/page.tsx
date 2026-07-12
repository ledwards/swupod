// @ts-nocheck
'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useCardPreview } from '@/src/hooks/useCardPreview'
import { useStickyTab } from '@/src/hooks/useStickyTab'
import { CardPreview } from '@/src/components/DeckBuilder/CardPreview'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import { AspectIcon, ASPECTS } from '@/src/components/AspectIcon'
import CardDataTierList from '@/src/components/CardDataTierList'
import { AspectFilterButtons, AspectsCell, TableFilter, useTableFilter } from '@/src/components/stats/TableFilters'
import { LeaderCharts, CardCharts } from './StatsCharts'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
import { PATREON_URL } from '@/src/utils/membership'
import {
  DEFAULT_STATS_SET_TAB,
  getStatsSetTabs,
  STATS_SET_COLORS,
} from '@/src/utils/statsSetTabs'
import './stats.css'

const tournamentPlayerCount = tournamentUserIds.length

// Stats start date - default to env var, or 2026-02-12 when position-based slot_type tracking was deployed.
const DEFAULT_START_DATE = process.env.NEXT_PUBLIC_STATS_START_DATE || '2026-02-12'

// Format numbers with commas
const fmt = (n: number) => n.toLocaleString()

// Format a YYYY-MM-DD date for display
const formatDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

// Get today as YYYY-MM-DD
const todayStr = () => new Date().toISOString().slice(0, 10)

// === StatsCell: Stacked You/All/Top/Tournament values ===

function DeltaBadge({ value, youValue, mode }: { value: number, youValue: number, mode: 'pct' | 'num' | 'lowIsGood' }) {
  if (youValue === 0 && mode === 'num') return null
  const diff = value - youValue
  if (Math.abs(diff) < 0.05) return null

  // For 'lowIsGood' (like Avg Pick), lower is better so invert the color
  const isPositiveGood = mode !== 'lowIsGood'
  const isGood = isPositiveGood ? diff > 0 : diff < 0
  const arrow = diff > 0 ? '\u25B2' : '\u25BC'
  const color = isGood ? '#4ade80' : '#f87171'

  let label: string
  if (mode === 'pct') {
    label = `${Math.abs(diff).toFixed(1)}pts`
  } else if (mode === 'lowIsGood') {
    label = Math.abs(diff).toFixed(1)
  } else {
    const absDiff = Math.abs(diff)
    const pctChange = youValue !== 0 ? Math.abs((diff / youValue) * 100) : 0
    label = `${fmt(Math.round(absDiff))} (${pctChange.toFixed(0)}%)`
  }

  return <span className="stats-delta" style={{ color }}> {arrow}{label}</span>
}

function StatsCell({ you, all, top, tournament, format, className, showYou, showAll, showTop, showTournament, isBlurred, deltaMode, user }: {
  you: string | number | null | undefined
  all: string | number | null | undefined
  top: string | number | null | undefined
  tournament: string | number | null | undefined
  format?: (v: any) => string
  className?: string
  showYou: boolean
  showAll: boolean
  showTop: boolean
  showTournament: boolean
  isBlurred?: boolean
  deltaMode?: 'pct' | 'num' | 'lowIsGood'
  user?: any
}) {
  const f = format || String
  const youNum = typeof you === 'number' ? you : null

  // Determine which datasets are visible, in display order: You, All, Tournament, Top
  const visibleDatasets: { key: string, val: string | number | null | undefined }[] = []
  if (showYou) visibleDatasets.push({ key: 'you', val: you })
  if (showAll) visibleDatasets.push({ key: 'all', val: all })
  if (showTournament) visibleDatasets.push({ key: 'tournament', val: tournament })
  if (showTop) visibleDatasets.push({ key: 'top', val: top })

  // For 2-selection comparison: delta bottom from top
  // For >2 or 1: delta vs You if visible
  const getBaseValue = (datasetKey: string): number | null => {
    if (visibleDatasets.length === 2) {
      // Delta the second from the first
      if (datasetKey === visibleDatasets[1]?.key) {
        const baseVal = visibleDatasets[0]?.val
        return typeof baseVal === 'number' ? baseVal : null
      }
      return null // First item gets no delta
    }
    // Default: delta vs You
    return youNum
  }

  const renderDelta = (val: string | number | null | undefined, datasetKey: string) => {
    if (!deltaMode || typeof val !== 'number') return null
    const baseVal = getBaseValue(datasetKey)
    if (baseVal == null) return null
    return <DeltaBadge value={val} youValue={baseVal} mode={deltaMode} />
  }

  return (
    <td className={`stats-stacked-cell ${className || ''}`}>
      {showYou && (
        <div className="stats-row-you">
          <span className="stats-row-label">You:</span> {user ? (<>{you != null ? f(you) : '—'}{renderDelta(you, 'you')}</>) : <a href="/api/auth/signin/discord?return_to=/stats" className="stats-login-link">Log in</a>}
        </div>
      )}
      {showAll && (
        <div className="stats-row-all">
          <span className="stats-row-label">All:</span> {all != null ? f(all) : '—'}{renderDelta(all, 'all')}
        </div>
      )}
      {showTournament && (
        <div className="stats-row-tournament">
          <span className="stats-row-label">Competitive:</span> {isBlurred ? <span className="stats-blur-value">---</span> : (<>{tournament != null ? f(tournament) : '—'}{renderDelta(tournament, 'tournament')}</>)}
        </div>
      )}
      {showTop && (
        <div className="stats-row-top">
          <span className="stats-row-label">Top:</span> {isBlurred ? <span className="stats-blur-value">---</span> : (<>{top != null ? f(top) : '—'}{renderDelta(top, 'top')}</>)}
        </div>
      )}
    </td>
  )
}

// === StatsLegend: Toggleable You/All/Top/Tournament with filters ===

function StatsLegend({ user, showYou, showAll, showTop, showTournament, onToggleYou, onToggleAll, onToggleTop, onToggleTournament, includeBots, includeHumans, onToggleBots, onToggleHumans, isBlurred, topPlayerCount }: {
  user: any
  showYou: boolean
  showAll: boolean
  showTop: boolean
  showTournament: boolean
  onToggleYou: () => void
  onToggleAll: () => void
  onToggleTop: () => void
  onToggleTournament: () => void
  includeBots: boolean
  includeHumans: boolean
  onToggleBots: () => void
  onToggleHumans: () => void
  isBlurred?: boolean
  topPlayerCount?: number | null
}) {
  return (
    <div className="stats-legend-bar">
      <div className="stats-legend-group">
        {user ? (
          <label className="stats-legend-toggle stats-legend-you">
            <input type="checkbox" checked={showYou} onChange={onToggleYou} />
            You
          </label>
        ) : (
          <a href="/api/auth/signin/discord?return_to=/stats" className="stats-legend-login">Log in</a>
        )}
      </div>
      <span className="stats-legend-sep">&middot;</span>
      <div className="stats-legend-group">
        <label className="stats-legend-toggle stats-legend-all">
          <input type="checkbox" checked={showAll} onChange={onToggleAll} />
          All
        </label>
      </div>
      <span className="stats-legend-sep">&middot;</span>
      <div className="stats-legend-group">
        <label className={`stats-legend-toggle stats-legend-tournament ${isBlurred ? 'stats-legend-locked' : ''}`}>
          <input type="checkbox" checked={showTournament} onChange={onToggleTournament} disabled={isBlurred} />
          Competitive Players {isBlurred && '🔒'}
          <span className="stats-filter-info" title="App users who have competed in melee.gg events">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
        </label>
      </div>
      <span className="stats-legend-sep">&middot;</span>
      <div className="stats-legend-group">
        <label className={`stats-legend-toggle stats-legend-top ${isBlurred ? 'stats-legend-locked' : ''}`}>
          <input type="checkbox" checked={showTop} onChange={onToggleTop} disabled={isBlurred} />
          Top Players {isBlurred && '🔒'}
          <span className="stats-filter-info" title="Top performing competitive players">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
        </label>
      </div>
      <span className="stats-legend-sep">&middot;</span>
      <div className="stats-legend-group">
        <label className="stats-legend-filter">
          <input type="checkbox" checked={includeHumans} onChange={onToggleHumans} />
          Humans
        </label>
        <label className="stats-legend-filter">
          <input type="checkbox" checked={includeBots} onChange={onToggleBots} />
          Bots
        </label>
      </div>
    </div>
  )
}

function ChartFilter({ search, setSearch, activeAspects, toggleAspect, clearAll, includeHumans, includeBots, onToggleHumans, onToggleBots }: {
  search: string
  setSearch: (s: string) => void
  activeAspects: Set<string>
  toggleAspect: (a: string) => void
  clearAll?: () => void
  includeHumans: boolean
  includeBots: boolean
  onToggleHumans: () => void
  onToggleBots: () => void
}) {
  return (
    <div className="stats-chart-filter">
      <div className="stats-chart-filter-row">
        <div className="stats-chart-filter-checks">
          <label className="stats-legend-filter">
            <input type="checkbox" checked={includeHumans} onChange={onToggleHumans} />
            Humans
          </label>
          <label className="stats-legend-filter">
            <input type="checkbox" checked={includeBots} onChange={onToggleBots} />
            Bots
          </label>
        </div>
      </div>
      <div className="stats-chart-filter-row">
        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="stats-search-input"
        />
        <AspectFilterButtons activeAspects={activeAspects} toggleAspect={toggleAspect} clearAll={clearAll} />
      </div>
    </div>
  )
}

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState(DEFAULT_STATS_SET_TAB)
  const [includeBots, setIncludeBots] = useState(false)
  const [includeHumans, setIncludeHumans] = useState(true)
  const [showYou, setShowYou] = useState(true)
  const [showAll, setShowAll] = useState(true)
  const [showTop, setShowTop] = useState(true)
  const [showTournament, setShowTournament] = useState(true)
  const [topPlayerCount, setTopPlayerCount] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState(todayStr())
  const [editingStart, setEditingStart] = useState(false)
  const [editingEnd, setEditingEnd] = useState(false)
  const { user, isPatron, loading: authLoading } = useAuth()
  const canSeeFullStats = isPatron === true || user?.is_admin
  const hasBetaSetAccess = Boolean(user?.is_beta_tester || user?.is_admin)
  const tabs = useMemo(() => getStatsSetTabs(hasBetaSetAccess), [hasBetaSetAccess])

  useEffect(() => {
    fetch('/api/stats/top-player-count')
      .then(r => r.json())
      .then(d => setTopPlayerCount(d.count))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash && tabs.includes(hash)) {
      // Respect an explicit set tab in the URL hash.
      setActiveTab(hash)
    } else {
      // Bare /stats — always default to the latest set (tabs are newest-first).
      setActiveTab(tabs[0])
    }
  }, [tabs])

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && tabs.includes(hash)) setActiveTab(hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [tabs])

  useEffect(() => {
    if (authLoading || tabs.includes(activeTab)) return
    const fallbackTab = tabs.includes(DEFAULT_STATS_SET_TAB) ? DEFAULT_STATS_SET_TAB : tabs[0]
    setActiveTab(fallbackTab)
    if (window.location.hash.slice(1) === activeTab) {
      window.location.hash = fallbackTab
    }
  }, [activeTab, authLoading, tabs])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    window.location.hash = tab
  }

  const isBlurred = !canSeeFullStats

  const legendProps = {
    user,
    showYou, showAll, showTop, showTournament,
    onToggleYou: () => setShowYou(!showYou),
    onToggleAll: () => setShowAll(!showAll),
    onToggleTop: () => setShowTop(!showTop),
    onToggleTournament: () => setShowTournament(!showTournament),
    includeBots, includeHumans,
    onToggleBots: () => setIncludeBots(!includeBots),
    onToggleHumans: () => setIncludeHumans(!includeHumans),
    isBlurred,
    topPlayerCount,
  }

  return (
    <div className="stats-page">
      <div className="stats-header">
        <h1>Stats</h1>
        <p>Card performance across drafts and sealed</p>
        <div className="stats-date-range">
          <span className="date-field">
            {editingStart ? (
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onBlur={() => setEditingStart(false)}
                autoFocus
                className="date-input"
              />
            ) : (
              <>
                <span className="date-display">{formatDate(startDate)}</span>
                <button className="date-edit-btn" onClick={() => setEditingStart(true)} title="Change start date">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
              </>
            )}
          </span>
          <span className="date-separator"> to </span>
          <span className="date-field">
            {editingEnd ? (
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onBlur={() => setEditingEnd(false)}
                autoFocus
                className="date-input"
              />
            ) : (
              <>
                <span className="date-display">{formatDate(endDate)}</span>
                <button className="date-edit-btn" onClick={() => setEditingEnd(true)} title="Change end date">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="stats-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`stats-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => handleTabChange(tab)}
            style={STATS_SET_COLORS[tab] ? {
              '--set-color': STATS_SET_COLORS[tab],
              ...(activeTab === tab ? {
                backgroundColor: STATS_SET_COLORS[tab],
                borderBottomColor: STATS_SET_COLORS[tab]
              } : {})
            } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="stats-content">
        {isBlurred && isPatron !== null && (
          <div className="stats-patron-cta">
            <div className="stats-patron-cta-content">
              <div className="stats-patron-cta-text">
                <span className="stats-patron-cta-icon">🔒</span>
                <div>
                  <h3 className="stats-patron-cta-heading">Unlock <span style={{ color: '#CE93D8' }}>Competitive</span> and Top Player Stats</h3>
                  <p className="stats-patron-cta-desc">Support Protect the Pod to see stats from top competitive players.</p>
                </div>
              </div>
              <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="primary">Support Protect the Pod</Button>
              </a>
            </div>
          </div>
        )}
        <SetStatsTab
          setCode={activeTab}
          includeBots={includeBots}
          includeHumans={includeHumans}
          startDate={startDate}
          endDate={endDate}
          user={user}
          showYou={showYou}
          showAll={showAll}
          showTop={showTop}
          showTournament={showTournament}
          legendProps={legendProps}
          isBlurred={isBlurred}
          canSeeFullStats={canSeeFullStats}
        />
      </div>
    </div>
  )
}

interface SetStatsTabProps {
  setCode: string
  includeBots: boolean
  includeHumans: boolean
  startDate: string
  endDate: string
  user: any
  showYou: boolean
  showAll: boolean
  showTop: boolean
  showTournament: boolean
  legendProps: any
  isBlurred?: boolean
  canSeeFullStats?: boolean
}

function SetStatsTab({ setCode, includeBots, includeHumans, startDate, endDate, user, showYou, showAll, showTop, showTournament, legendProps, isBlurred, canSeeFullStats }: SetStatsTabProps) {
  // Secondary subtab — persists across visits via localStorage; the page hash
  // belongs to the primary set tab, so this group stays out of the URL (url:false).
  const [subTab, setStickySubTab] = useStickyTab(STATS_SUBTABS, 'cards', { url: false, storageKey: 'ptp:stats-subtab' })

  useEffect(() => {
    const requestedTab = getUrlSearchParam(STATS_SUBTAB_PARAM)
    const requestedView = getUrlSearchParam(CARD_DATA_VIEW_PARAM)
    if (requestedTab === 'card-data') {
      setStickySubTab('cards')
    } else if (STATS_SUBTABS.includes(requestedTab as StatsSubTab)) {
      setStickySubTab(requestedTab as StatsSubTab)
    } else if (requestedView === 'tiers' || requestedView === 'table') {
      setStickySubTab('cards')
    }
  }, [setStickySubTab])

  const setSubTab = (next: StatsSubTab) => {
    setStickySubTab(next)
    replaceUrlSearchParam(STATS_SUBTAB_PARAM, next === 'cards' ? null : next)
    if (next !== 'cards') replaceUrlSearchParam(CARD_DATA_VIEW_PARAM, null)
  }

  return (
    <div className="generation-stats">
      <div className="stats-subtabs">
        <button
          className={`stats-subtab ${subTab === 'cards' ? 'active' : ''}`}
          onClick={() => setSubTab('cards')}
        >
          Cards
        </button>
        <button
          className={`stats-subtab ${subTab === 'draft' ? 'active' : ''}`}
          onClick={() => setSubTab('draft')}
        >
          Draft Picks
        </button>
        <button
          className={`stats-subtab ${subTab === 'sealed' ? 'active' : ''}`}
          onClick={() => setSubTab('sealed')}
        >
          Sealed Decks
        </button>
      </div>

      {subTab === 'cards' ? (
        <CardDataTierList setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} allowTable viewParamName={CARD_DATA_VIEW_PARAM} />
      ) : subTab === 'draft' ? (
        <DraftTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} canSeeFullStats={canSeeFullStats} />
      ) : (
        <SealedTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} canSeeFullStats={canSeeFullStats} />
      )}
    </div>
  )
}

// === Shared Types ===

interface DraftPickCard {
  cardName: string
  cardId: string
  rarity: string
  cardType: string
  timesPicked: number
  firstPicks: number
  firstPickPct: number | null
  avgPickPosition: number
  draftsSeenIn: number
  aspects: string[]
  subtitle: string | null
  cost: number | null
  imageUrl: string | null
}

interface DraftPickStats {
  setCode: string
  totalPicks: number
  totalDrafts: number
  totalDrafters: number
  cards: DraftPickCard[]
}

interface DeckInclusionCard {
  cardName: string
  cardId: string
  rarity: string
  cardType: string
  aspects: string[]
  poolsWithCard: number
  decksWithCard: number
  inclusionRate: number
  avgCopiesPlayed: number
  offAspectRate: number
  topLeaders: { leaderName: string; synergy: number }[]
  subtitle: string | null
  cost: number | null
  imageUrl: string | null
}

interface LeaderSynergy {
  leaderName: string
  leaderSubtitle: string | null
  leaderImageUrl: string | null
  deckCount: number
  topSynergyCards: { cardName: string; synergy: number }[]
}

interface DeckInclusionStats {
  setCode: string
  totalPoolsWithDecks: number
  cards: DeckInclusionCard[]
  leaderSynergies?: LeaderSynergy[]
}

interface LeaderSelection {
  cardName: string
  cardId: string
  timesSelected: number
  selectionRate: number
  rarity: string | null
  aspects: string[]
  subtitle: string | null
  imageUrl: string | null
}

type SortKey = 'cardName' | 'rarity' | 'avgPickPosition' | 'firstPickPct' | 'timesPicked'
type DeckSortKey = 'cardName' | 'rarity' | 'inclusionRate' | 'avgCopiesPlayed' | 'poolsWithCard' | 'offAspectRate'
type LeaderSortKey = 'cardName' | 'avgPickPosition' | 'firstPickPct' | 'timesPicked'
type LeaderSelSortKey = 'cardName' | 'timesSelected' | 'selectionRate'

const RARITY_ORDER: Record<string, number> = { 'Legendary': 0, 'Rare': 1, 'Uncommon': 2, 'Common': 3 }
const STATS_SUBTABS = ['cards', 'draft', 'sealed'] as const
type StatsSubTab = typeof STATS_SUBTABS[number]
const STATS_SUBTAB_PARAM = 'tab'
const CARD_DATA_VIEW_PARAM = 'view'

function getUrlSearchParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

function replaceUrlSearchParam(name: string, value: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (value) url.searchParams.set(name, value)
  else url.searchParams.delete(name)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

// === Shared Skeleton ===

function SkeletonBlock({ width, height = 14 }: { width?: string, height?: number }) {
  return <div className="skeleton-line" style={{ maxWidth: width, height: `${height}px` }} />
}

function SkeletonTableRows({ columns, rows = 8 }: { columns: string[], rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {columns.map((w, j) => (
            <td key={j}><SkeletonBlock width={w} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

function SkeletonChartGrid() {
  const labels = ['You', 'All Players', 'Competitive Players', 'Top Players']
  return (
    <div className="stats-chart-grid">
      {labels.map(label => (
        <div key={label} className="stats-chart-panel">
          <h4 className="stats-chart-panel-label" style={{ color: label === 'You' ? 'rgba(255,255,255,0.9)' : label.startsWith('Competitive') ? '#CE93D8' : label.startsWith('Top') ? '#FFB74D' : '#4DB6AC' }}>{label}</h4>
          <div className="skeleton-line" style={{ height: '180px', borderRadius: '6px' }} />
        </div>
      ))}
    </div>
  )
}

function SkeletonFilterBar() {
  return (
    <div className="stats-table-filter">
      <div className="skeleton-line" style={{ width: '200px', height: '32px', borderRadius: '6px' }} />
      <div className="stats-aspect-filter">
        {ASPECTS.map(aspect => (
          <div key={aspect} className="stats-aspect-btn" style={{ opacity: 0.3 }}>
            <AspectIcon aspect={aspect} size="sm" />
          </div>
        ))}
        <div className="stats-aspect-btn stats-aspect-btn-text" style={{ opacity: 0.3 }}><span className="stats-aspect-label">N</span></div>
        <div className="stats-aspect-btn stats-aspect-btn-text" style={{ opacity: 0.3 }}><span className="stats-aspect-label">M</span></div>
      </div>
    </div>
  )
}

function SkeletonLegend() {
  return (
    <div className="stats-legend-bar">
      <SkeletonBlock width="40px" height={16} />
      <span className="stats-legend-sep">&middot;</span>
      <SkeletonBlock width="30px" height={16} />
      <span className="stats-legend-sep">&middot;</span>
      <SkeletonBlock width="100px" height={16} />
      <span className="stats-legend-sep">&middot;</span>
      <SkeletonBlock width="80px" height={16} />
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="cards-subtab">
      {/* === Charts Section (top) === */}
      <div className="stats-charts-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <div className="stats-chart-filter">
          <div className="stats-chart-filter-row">
            <div className="skeleton-line" style={{ width: '200px', height: '32px', borderRadius: '6px' }} />
            <div className="stats-chart-filter-checks">
              <SkeletonBlock width="70px" height={16} />
              <SkeletonBlock width="50px" height={16} />
            </div>
          </div>
          <div className="stats-aspect-filter">
            {ASPECTS.map(aspect => (
              <div key={aspect} className="stats-aspect-btn" style={{ opacity: 0.3 }}>
                <AspectIcon aspect={aspect} size="sm" />
              </div>
            ))}
            <div className="stats-aspect-btn stats-aspect-btn-text" style={{ opacity: 0.3 }}><span className="stats-aspect-label">N</span></div>
            <div className="stats-aspect-btn stats-aspect-btn-text" style={{ opacity: 0.3 }}><span className="stats-aspect-label">M</span></div>
          </div>
        </div>
        <h4>Leader Draft Frequency</h4>
        <SkeletonChartGrid />
        <h4>Cards by Times Drafted</h4>
        <SkeletonChartGrid />
      </div>

      {/* === Leaders Section === */}
      <h3 style={{ marginBottom: '0.5rem' }}>Leaders</h3>

      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        <SkeletonBlock width="320px" />
      </div>

      <SkeletonLegend />
      <SkeletonFilterBar />

      <div className="stats-table-container" style={{ marginBottom: '1.5rem' }}>
        <table className="stats-table">
          <thead>
            <tr>
              <th>Leader</th>
              <th className="aspects-col">Aspects</th>
              <th>Rarity</th>
              <th>Avg Pick</th>
              <th>1st Pick</th>
              <th># Drafted</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonTableRows columns={['140px', '50px', '60px', '80px', '90px', '70px']} rows={6} />
          </tbody>
        </table>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        <SkeletonBlock width="280px" />
      </div>
      <SkeletonLegend />
      <div className="stats-table-container" style={{ marginBottom: '2rem' }}>
        <table className="stats-table">
          <thead>
            <tr>
              <th>Leader</th>
              <th className="aspects-col">Aspects</th>
              <th>Rarity</th>
              <th>Selection %</th>
              <th># Selected</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonTableRows columns={['140px', '50px', '60px', '80px', '70px']} rows={6} />
          </tbody>
        </table>
      </div>

      {/* === Cards Section === */}
      <h3 style={{ marginBottom: '0.5rem' }}>Cards</h3>

      <div className="draft-picks-summary">
        <div className="stat-item">
          <span className="stat-label">Drafts:</span>
          <span className="stat-value"><SkeletonBlock width="60px" height={28} /></span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Picks:</span>
          <span className="stat-value"><SkeletonBlock width="80px" height={28} /></span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Drafters:</span>
          <span className="stat-value"><SkeletonBlock width="50px" height={28} /></span>
        </div>
      </div>

      <SkeletonLegend />
      <SkeletonFilterBar />

      <div className="stats-table-container">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="aspects-col">Aspects</th>
              <th>Rarity</th>
              <th>Avg Pick</th>
              <th>1st Pick</th>
              <th># Drafted</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonTableRows columns={['140px', '50px', '60px', '70px', '90px', '60px']} rows={10} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

// === Helper: build lookup map keyed by cardName ===

function buildLookupMap<T extends { cardName: string }>(items: T[] | undefined): Map<string, T> {
  const map = new Map<string, T>()
  if (!items) return map
  for (const item of items) {
    map.set(item.cardName, item)
  }
  return map
}

// === Draft Tab (Cards + Leaders) ===

interface TabProps {
  setCode: string
  includeBots: boolean
  includeHumans: boolean
  startDate: string
  endDate: string
  user: any
  showYou: boolean
  showAll: boolean
  showTop: boolean
  showTournament: boolean
  legendProps: any
  isBlurred?: boolean
  canSeeFullStats?: boolean
}

function DraftTab({ setCode, includeBots, includeHumans, startDate, endDate, user, showYou, showAll, showTop, showTournament, legendProps, isBlurred, canSeeFullStats }: TabProps) {
  // All Players data
  const [cardData, setCardData] = useState<DraftPickStats | null>(null)
  const [leaderData, setLeaderData] = useState<DraftPickStats | null>(null)
  // Tournament Players data (tournamentOnly)
  const [cardDataTournament, setCardDataTournament] = useState<DraftPickStats | null>(null)
  const [leaderDataTournament, setLeaderDataTournament] = useState<DraftPickStats | null>(null)
  // Top Players data (topPlayersOnly)
  const [cardDataTop, setCardDataTop] = useState<DraftPickStats | null>(null)
  const [leaderDataTop, setLeaderDataTop] = useState<DraftPickStats | null>(null)
  // You data
  const [cardDataYou, setCardDataYou] = useState<DraftPickStats | null>(null)
  const [leaderDataYou, setLeaderDataYou] = useState<DraftPickStats | null>(null)
  // Opening-context stats (which leader is taken OVER which in a shared opening
  // pack). Fetched per cohort; the expandable "picked over" panel reads these.
  const [openingsAll, setOpeningsAll] = useState<any | null>(null)
  const [openingsTop, setOpeningsTop] = useState<any | null>(null)
  const [expandedLeader, setExpandedLeader] = useState<string | null>(null)
  const [openingsCohort, setOpeningsCohort] = useState<'all' | 'top'>('all')

  const [loading, setLoading] = useState(true)
  const hasLoadedOnce = useRef(false)
  const [cardSortKey, setCardSortKey] = useState<SortKey>('avgPickPosition')
  const [cardSortAsc, setCardSortAsc] = useState(true)
  // Lead with first-pick rate: in a draft, leaders are exclusive picks, so
  // deck-selection share is near-uniform and uninformative. Pick order (how
  // often a leader is taken first) is the real signal, so default-sort by it.
  const [leaderSortKey, setLeaderSortKey] = useState<LeaderSortKey>('firstPickPct')
  const [leaderSortAsc, setLeaderSortAsc] = useState(false)
  const leaderFilter = useTableFilter()
  const cardFilter = useTableFilter()
  const leaderChartFilter = useTableFilter()
  const cardChartFilter = useTableFilter()
  const {
    hoveredCardPreview,
    handleCardMouseEnter,
    handleCardMouseLeave,
    handlePreviewMouseEnter,
    handlePreviewMouseLeave,
    handleCardTouchStart,
    handleCardTouchEnd,
    dismissPreview,
  } = useCardPreview()

  // Filtered chart data
  const filterLeaderChartData = (data: any[] | null) => {
    if (!data) return null
    return data.filter(leaderChartFilter.filterFn)
  }
  const filterCardChartData = (data: any[] | null) => {
    if (!data) return null
    return data.filter(cardChartFilter.filterFn)
  }

  useEffect(() => {
    if (!hasLoadedOnce.current) setLoading(true)
    // Drop stale responses: the active set tab can change (e.g. LAW -> ASH as auth
    // resolves) while requests are in flight. Without this guard a slow response for
    // the previous set overwrites the current set's panels, so e.g. the ASH tab shows
    // LAW data. apply() ignores any result once this effect has been superseded.
    let cancelled = false
    const apply = (setter: (v: any) => void) => (result: any) => { if (!cancelled) setter(result.data || result) }

    const baseParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      includeBots: String(includeBots),
      includeHumans: String(includeHumans),
    })
    baseParams.set('builtDeckOnly', 'true')

    const tournamentParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      tournamentOnly: 'true',
      builtDeckOnly: 'true',
    })

    const topPlayersParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      topPlayersOnly: 'true',
      builtDeckOnly: 'true',
    })

    const fetches: Promise<void>[] = [
      // All Players
      fetch(`/api/stats/draft-picks?${baseParams}`)
        .then(r => r.json()).then(apply(setCardData))
        .catch(err => console.error('Error fetching card draft picks:', err)),
      fetch(`/api/stats/draft-picks?${baseParams}&type=leaders`)
        .then(r => r.json()).then(apply(setLeaderData))
        .catch(err => console.error('Error fetching leader draft picks:', err)),
      fetch(`/api/stats/leader-openings?${new URLSearchParams({ setCode, since: startDate, until: endDate })}`)
        .then(r => r.json()).then(apply(setOpeningsAll))
        .catch(err => console.error('Error fetching leader openings:', err)),
    ]

    // Tournament + Top Players: only fetch if patron/admin
    if (canSeeFullStats) {
      fetches.push(
        // Tournament Players (not affected by Humans/Bots filter)
        fetch(`/api/stats/draft-picks?${tournamentParams}`)
          .then(r => r.json()).then(apply(setCardDataTournament))
          .catch(err => console.error('Error fetching tournament card draft picks:', err)),
        fetch(`/api/stats/draft-picks?${tournamentParams}&type=leaders`)
          .then(r => r.json()).then(apply(setLeaderDataTournament))
          .catch(err => console.error('Error fetching tournament leader draft picks:', err)),
        // Top Players (not affected by Humans/Bots filter)
        fetch(`/api/stats/draft-picks?${topPlayersParams}`)
          .then(r => r.json()).then(apply(setCardDataTop))
          .catch(err => console.error('Error fetching top player card draft picks:', err)),
        fetch(`/api/stats/draft-picks?${topPlayersParams}&type=leaders`)
          .then(r => r.json()).then(apply(setLeaderDataTop))
          .catch(err => console.error('Error fetching top player leader draft picks:', err)),
        fetch(`/api/stats/leader-openings?${new URLSearchParams({ setCode, since: startDate, until: endDate, topPlayersOnly: 'true' })}`)
          .then(r => r.json()).then(apply(setOpeningsTop))
          .catch(err => console.error('Error fetching top player leader openings:', err)),
      )
    } else {
      setCardDataTournament(null)
      setLeaderDataTournament(null)
      setCardDataTop(null)
      setLeaderDataTop(null)
      setOpeningsTop(null)
    }

    // You fetches (only if logged in, not affected by Humans/Bots filter)
    if (user?.id) {
      const youParams = new URLSearchParams({
        setCode,
        since: startDate,
        until: endDate,
        userId: user.id,
      })
      youParams.set('builtDeckOnly', 'true')
      fetches.push(
        fetch(`/api/stats/draft-picks?${youParams}`)
          .then(r => r.json()).then(apply(setCardDataYou))
          .catch(err => console.error('Error fetching your card draft picks:', err)),
        fetch(`/api/stats/draft-picks?${youParams}&type=leaders`)
          .then(r => r.json()).then(apply(setLeaderDataYou))
          .catch(err => console.error('Error fetching your leader draft picks:', err)),
      )
    } else {
      setCardDataYou(null)
      setLeaderDataYou(null)
    }

    Promise.all(fetches).finally(() => { if (!cancelled) { setLoading(false); hasLoadedOnce.current = true } })
    return () => { cancelled = true }
  }, [setCode, includeBots, includeHumans, startDate, endDate, user?.id, canSeeFullStats])

  // Build lookup maps for Tournament, Top, and You data
  const cardTournamentMap = useMemo(() => buildLookupMap(cardDataTournament?.cards), [cardDataTournament?.cards])
  const cardTopMap = useMemo(() => buildLookupMap(cardDataTop?.cards), [cardDataTop?.cards])
  const cardYouMap = useMemo(() => buildLookupMap(cardDataYou?.cards), [cardDataYou?.cards])
  const leaderTournamentMap = useMemo(() => buildLookupMap(leaderDataTournament?.cards), [leaderDataTournament?.cards])
  const leaderTopMap = useMemo(() => buildLookupMap(leaderDataTop?.cards), [leaderDataTop?.cards])
  const leaderYouMap = useMemo(() => buildLookupMap(leaderDataYou?.cards), [leaderDataYou?.cards])
  const openingsAllMap = useMemo(() => {
    const m = new Map<string, any>(); (openingsAll?.leaders || []).forEach((l: any) => m.set(l.leader, l)); return m
  }, [openingsAll])
  const openingsTopMap = useMemo(() => {
    const m = new Map<string, any>(); (openingsTop?.leaders || []).forEach((l: any) => m.set(l.leader, l)); return m
  }, [openingsTop])

  const handleCardSort = (key: SortKey) => {
    if (cardSortKey === key) setCardSortAsc(!cardSortAsc)
    else { setCardSortKey(key); setCardSortAsc(key === 'avgPickPosition' || key === 'cardName') }
  }

  const handleLeaderSort = (key: LeaderSortKey) => {
    if (leaderSortKey === key) setLeaderSortAsc(!leaderSortAsc)
    else { setLeaderSortKey(key); setLeaderSortAsc(key === 'avgPickPosition' || key === 'cardName') }
  }

  const sortedCards = useMemo(() => {
    if (!cardData?.cards) return []
    return [...cardData.cards].sort((a, b) => {
      let cmp = 0
      switch (cardSortKey) {
        case 'cardName': cmp = a.cardName.localeCompare(b.cardName); break
        case 'rarity': cmp = (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9); break
        case 'avgPickPosition': cmp = a.avgPickPosition - b.avgPickPosition; break
        case 'firstPickPct': cmp = (a.firstPickPct ?? -1) - (b.firstPickPct ?? -1); break
        case 'timesPicked': cmp = a.timesPicked - b.timesPicked; break
      }
      return cardSortAsc ? cmp : -cmp
    })
  }, [cardData?.cards, cardSortKey, cardSortAsc])

  const sortedLeaders = useMemo(() => {
    if (!leaderData?.cards) return []
    return [...leaderData.cards].sort((a, b) => {
      let cmp = 0
      switch (leaderSortKey) {
        case 'cardName': cmp = a.cardName.localeCompare(b.cardName); break
        case 'avgPickPosition': cmp = a.avgPickPosition - b.avgPickPosition; break
        case 'firstPickPct': cmp = (a.firstPickPct ?? -1) - (b.firstPickPct ?? -1); break
        case 'timesPicked': cmp = a.timesPicked - b.timesPicked; break
      }
      return leaderSortAsc ? cmp : -cmp
    })
  }, [leaderData?.cards, leaderSortKey, leaderSortAsc])

  const filteredCards = useMemo(() => sortedCards.filter(cardFilter.filterFn), [sortedCards, cardFilter.search, cardFilter.activeAspects])
  const filteredLeaders = useMemo(() => sortedLeaders.filter(leaderFilter.filterFn), [sortedLeaders, leaderFilter.search, leaderFilter.activeAspects])

  if (loading) return <LoadingSkeleton />

  const rarityClass = (r: string) => `rarity-${r.toLowerCase()}`

  const CardSortHeader = ({ label, col, title }: { label: string, col: SortKey, title?: string }) => (
    <th className={`sortable ${cardSortKey === col ? 'active' : ''}`} onClick={() => handleCardSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardSort(col) } }} tabIndex={0} aria-sort={cardSortKey === col ? (cardSortAsc ? 'ascending' : 'descending') : 'none'} title={title}>
      {label}{cardSortKey === col && <span className="sort-indicator">{cardSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )
  const LeaderSortHeader = ({ label, col, title }: { label: string, col: LeaderSortKey, title?: string }) => (
    <th className={`sortable ${leaderSortKey === col ? 'active' : ''}`} onClick={() => handleLeaderSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLeaderSort(col) } }} tabIndex={0} aria-sort={leaderSortKey === col ? (leaderSortAsc ? 'ascending' : 'descending') : 'none'} title={title}>
      {label}{leaderSortKey === col && <span className="sort-indicator">{leaderSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )

  const hasCards = cardData && cardData.cards && cardData.cards.length > 0
  const hasLeaders = leaderData && leaderData.cards && leaderData.cards.length > 0

  if (!hasCards && !hasLeaders) {
    return (
      <div className="stats-empty">
        <p>No draft data available for {setCode} yet.</p>
        <p>Draft pick statistics will appear after drafts are completed.</p>
      </div>
    )
  }

  const cellProps = { showYou, showAll, showTop, showTournament, isBlurred, user }

  return (
    <div className="cards-subtab">
      {/* Charts (data visualizations first) */}
      <div className="stats-charts-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <h4>Leader Draft Frequency <span className="stats-chart-subtitle">How often each leader is drafted (total times picked across all drafts)</span></h4>
        <ChartFilter
          {...leaderChartFilter}
          includeHumans={includeHumans}
          includeBots={includeBots}
          onToggleHumans={legendProps.onToggleHumans}
          onToggleBots={legendProps.onToggleBots}
        />
        <LeaderCharts
          allData={filterLeaderChartData(leaderData?.cards || null)}
          tournamentData={filterLeaderChartData(leaderDataTournament?.cards || null)}
          topData={filterLeaderChartData(leaderDataTop?.cards || null)}
          youData={filterLeaderChartData(leaderDataYou?.cards || null)}
          valueKey="timesPicked"
          canSeeFullStats={canSeeFullStats}
          user={user}
        />
        <h4>Cards by Times Drafted <span className="stats-chart-subtitle">Most frequently drafted cards across all drafts</span></h4>
        <ChartFilter
          {...cardChartFilter}
          includeHumans={includeHumans}
          includeBots={includeBots}
          onToggleHumans={legendProps.onToggleHumans}
          onToggleBots={legendProps.onToggleBots}
        />
        <CardCharts
          allData={filterCardChartData(cardData?.cards || null)}
          tournamentData={filterCardChartData(cardDataTournament?.cards || null)}
          topData={filterCardChartData(cardDataTop?.cards || null)}
          youData={filterCardChartData(cardDataYou?.cards || null)}
          valueKey="timesPicked"
          canSeeFullStats={canSeeFullStats}
          user={user}
          onCardHover={(card, e) => handleCardMouseEnter(card, e)}
          onCardLeave={handleCardMouseLeave}
        />
      </div>

      {/* Leaders Section */}
      {hasLeaders && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Leaders</h3>

          {/* Leader Draft Picks — led by first-pick rate. Deck-selection share is
              intentionally omitted for drafts: leaders are exclusive picks, so
              nearly every built deck has a different leader and the rate is
              near-uniform (~1/#leaders) by construction, not by preference. */}
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Draft pick order ({fmt(leaderData.totalDrafts)} drafts, {fmt(leaderData.totalPicks)} leader picks)
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span aria-hidden="true">▸</span> Click a leader to see which leaders it's taken over when they share an opening pack
            {canSeeFullStats && (openingsTop?.leaders?.length > 0) && (
              <span style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px' }}>
                <Button variant="toggle" glowColor="blue" active={openingsCohort === 'all'} size="sm" onClick={() => setOpeningsCohort('all')}>All</Button>
                <Button variant="toggle" glowColor="blue" active={openingsCohort === 'top'} size="sm" onClick={() => setOpeningsCohort('top')}>Top players</Button>
              </span>
            )}
          </p>
          <StatsLegend {...legendProps} showBuiltDeckFilter={true} />
          <TableFilter {...leaderFilter} />
          <div className="stats-table-container" style={{ marginBottom: '1.5rem' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <LeaderSortHeader label="Leader" col="cardName" />
                  <th className="aspects-col">Aspects</th>
                  <LeaderSortHeader label="Rarity" col="cardName" />
                  <LeaderSortHeader label="1st Pick %" col="firstPickPct" title="How often this leader is taken first in the leader draft (round 1), of all times it was drafted. Higher = more prioritized." />
                  <LeaderSortHeader label="Avg Pick" col="avgPickPosition" title="Average leader round this leader is taken (1 = first). Lower = higher priority." />
                  <LeaderSortHeader label="# Drafted" col="timesPicked" />
                </tr>
              </thead>
              <tbody>
                {filteredLeaders.map(card => {
                  const tournamentCard = leaderTournamentMap.get(card.cardName)
                  const topCard = leaderTopMap.get(card.cardName)
                  const youCard = leaderYouMap.get(card.cardName)
                  const openings = (canSeeFullStats && openingsCohort === 'top' ? openingsTopMap : openingsAllMap).get(card.cardName)
                  const rivals = (openings?.rivals || []).filter((r: any) => r.chosenOverPct !== null).slice(0, 6)
                  const canExpand = rivals.length > 0
                  const isExpanded = expandedLeader === card.cardName && canExpand
                  return [
                    <tr
                      key={card.cardId}
                      className={isExpanded ? 'leader-row-expanded' : undefined}
                      style={canExpand ? { cursor: 'pointer' } : undefined}
                      onClick={canExpand ? () => setExpandedLeader(isExpanded ? null : card.cardName) : undefined}
                    >
                      <td
                        className="card-name-cell"
                        onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: card.imageUrl || undefined, backImageUrl: card.backImageUrl || undefined, name: card.cardName, rarity: card.rarity, isLeader: true }, e)}
                        onMouseLeave={handleCardMouseLeave}
                        onTouchStart={() => handleCardTouchStart({ imageUrl: card.imageUrl || undefined, backImageUrl: card.backImageUrl || undefined, name: card.cardName, rarity: card.rarity, isLeader: true })}
                        onTouchEnd={handleCardTouchEnd}
                      >
                        {canExpand && <span aria-hidden="true" style={{ color: isExpanded ? '#8fc0f5' : 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginRight: '6px' }}>{isExpanded ? '▼' : '▸'}</span>}
                        <span className="card-name">{card.cardName}</span>
                        {card.subtitle && <span className="card-subtitle">{card.subtitle}</span>}
                      </td>
                      <AspectsCell aspects={card.aspects} />
                      <td><span className={rarityClass(card.rarity)}>{card.rarity}</span></td>
                      <StatsCell
                        {...cellProps}
                        you={youCard ? `${youCard.firstPicks}/${youCard.timesPicked} (${youCard.firstPickPct !== null ? `${youCard.firstPickPct}%` : '—'})` : null}
                        all={`${card.firstPicks}/${card.timesPicked} (${card.firstPickPct !== null ? `${card.firstPickPct}%` : '—'})`}
                        top={topCard ? `${topCard.firstPicks}/${topCard.timesPicked} (${topCard.firstPickPct !== null ? `${topCard.firstPickPct}%` : '—'})` : null}
                        tournament={tournamentCard ? `${tournamentCard.firstPicks}/${tournamentCard.timesPicked} (${tournamentCard.firstPickPct !== null ? `${tournamentCard.firstPickPct}%` : '—'})` : null}
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.avgPickPosition}
                        all={card.avgPickPosition}
                        top={topCard?.avgPickPosition}
                        tournament={tournamentCard?.avgPickPosition}
                        format={(v: number) => v.toFixed(1)}
                        deltaMode="lowIsGood"
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.timesPicked}
                        all={card.timesPicked}
                        top={topCard?.timesPicked}
                        tournament={tournamentCard?.timesPicked}
                        format={fmt}
                        deltaMode="num"
                      />
                    </tr>,
                    isExpanded && (
                      <tr key={`${card.cardId}-openings`} className="leader-openings-row">
                        <td colSpan={6} style={{ padding: '4px 16px 14px 28px', background: 'rgba(55,138,221,0.06)' }}>
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(255,255,255,0.5)', margin: '6px 0 8px' }}>
                            Picked over — when both are in an opening pack{canSeeFullStats && openingsCohort === 'top' ? ' (top players)' : ''}
                          </div>
                          {rivals.map((r: any) => (
                            <div key={r.rival} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', fontSize: '0.85rem' }}>
                              <span style={{ display: 'inline-block', width: '78px', height: '7px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', marginRight: '10px', position: 'relative', flexShrink: 0 }}>
                                <span style={{ position: 'absolute', left: 0, top: 0, height: '7px', borderRadius: '4px', width: `${r.chosenOverPct}%`, background: r.chosenOverPct >= 50 ? '#3fae52' : '#e2504a' }} />
                              </span>
                              <span style={{ fontWeight: 700, color: '#fff', minWidth: '46px' }}>{r.chosenOverPct}%</span>
                              <span style={{ color: 'rgba(255,255,255,0.6)', margin: '0 6px' }}>over</span>
                              <span style={{ color: '#dfe6ee' }}>{r.rival}</span>
                              <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>n={r.pickedOver + r.pickedUnder}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Cards Section */}
      {hasCards && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Cards</h3>
          <div className="draft-picks-summary">
            <div className="stat-item">
              <span className="stat-label">Drafts:</span>
              <span className="stat-value">{fmt(cardData.totalDrafts)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Picks:</span>
              <span className="stat-value">{fmt(cardData.totalPicks)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Drafters:</span>
              <span className="stat-value">{fmt(cardData.totalDrafters)}</span>
            </div>
          </div>

          {cardData.totalPicks < 100 && (
            <p className="stats-warning">
              Small sample size ({fmt(cardData.totalPicks)} picks from {fmt(cardData.totalDrafts)} drafts). Statistics may not be reliable yet.
            </p>
          )}

          <StatsLegend {...legendProps} showBuiltDeckFilter={true} />
          <TableFilter {...cardFilter} />
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <CardSortHeader label="Name" col="cardName" />
                  <th className="aspects-col">Aspects</th>
                  <CardSortHeader label="Rarity" col="rarity" />
                  <CardSortHeader label="Avg Pick" col="avgPickPosition" title="Average position this card is picked within a pack (1 = first pick, 14 = last). Lower is better" />
                  <CardSortHeader label="1st Pick" col="firstPickPct" title="How often this card is the first pick out of a fresh pack (pick position 1 of 14)" />
                  <CardSortHeader label="# Drafted" col="timesPicked" title="Total number of times this card was drafted across all drafts" />
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(card => {
                  const tournamentCard = cardTournamentMap.get(card.cardName)
                  const topCard = cardTopMap.get(card.cardName)
                  const youCard = cardYouMap.get(card.cardName)
                  return (
                    <tr key={card.cardId}>
                      <td
                        className="card-name-cell"
                        onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: card.imageUrl || undefined, name: card.cardName, rarity: card.rarity }, e)}
                        onMouseLeave={handleCardMouseLeave}
                        onTouchStart={() => handleCardTouchStart({ imageUrl: card.imageUrl || undefined, name: card.cardName, rarity: card.rarity })}
                        onTouchEnd={handleCardTouchEnd}
                      >
                        <span className="card-name">{card.cardName}</span>
                        {card.subtitle && <span className="card-subtitle">{card.subtitle}</span>}
                      </td>
                      <AspectsCell aspects={card.aspects} />
                      <td><span className={rarityClass(card.rarity)}>{card.rarity}</span></td>
                      <StatsCell
                        {...cellProps}
                        you={youCard?.avgPickPosition}
                        all={card.avgPickPosition}
                        top={topCard?.avgPickPosition}
                        tournament={tournamentCard?.avgPickPosition}
                        format={(v: number) => String(Math.round(v))}
                        deltaMode="lowIsGood"
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard ? `${youCard.firstPicks}/${youCard.timesPicked} (${youCard.firstPickPct !== null ? `${youCard.firstPickPct}%` : '—'})` : null}
                        all={`${card.firstPicks}/${card.timesPicked} (${card.firstPickPct !== null ? `${card.firstPickPct}%` : '—'})`}
                        top={topCard ? `${topCard.firstPicks}/${topCard.timesPicked} (${topCard.firstPickPct !== null ? `${topCard.firstPickPct}%` : '—'})` : null}
                        tournament={tournamentCard ? `${tournamentCard.firstPicks}/${tournamentCard.timesPicked} (${tournamentCard.firstPickPct !== null ? `${tournamentCard.firstPickPct}%` : '—'})` : null}
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.timesPicked}
                        all={card.timesPicked}
                        top={topCard?.timesPicked}
                        tournament={tournamentCard?.timesPicked}
                        format={fmt}
                        deltaMode="num"
                      />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hoveredCardPreview && (
        <CardPreview
          card={hoveredCardPreview.card}
          x={hoveredCardPreview.x}
          y={hoveredCardPreview.y}
          isMobile={hoveredCardPreview.isMobile}
          onMouseEnter={handlePreviewMouseEnter}
          onMouseLeave={handlePreviewMouseLeave}
          onDismiss={dismissPreview}
        />
      )}
    </div>
  )
}

// === Sealed Tab ===

function SealedTab({ setCode, includeBots, includeHumans, startDate, endDate, user, showYou, showAll, showTop, showTournament, legendProps, isBlurred, canSeeFullStats }: TabProps) {
  // All Players data
  const [cardData, setCardData] = useState<DeckInclusionStats | null>(null)
  const [leaderSelData, setLeaderSelData] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)
  // Tournament Players data (tournamentOnly)
  const [cardDataTournament, setCardDataTournament] = useState<DeckInclusionStats | null>(null)
  const [leaderSelDataTournament, setLeaderSelDataTournament] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)
  // Top Players data (topPlayersOnly)
  const [cardDataTop, setCardDataTop] = useState<DeckInclusionStats | null>(null)
  const [leaderSelDataTop, setLeaderSelDataTop] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)
  // You data
  const [cardDataYou, setCardDataYou] = useState<DeckInclusionStats | null>(null)
  const [leaderSelDataYou, setLeaderSelDataYou] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)

  const [loading, setLoading] = useState(true)
  const hasLoadedOnce = useRef(false)
  const [cardSortKey, setCardSortKey] = useState<DeckSortKey>('inclusionRate')
  const [cardSortAsc, setCardSortAsc] = useState(false)
  const [leaderSelSortKey, setLeaderSelSortKey] = useState<LeaderSelSortKey>('timesSelected')
  const [leaderSelSortAsc, setLeaderSelSortAsc] = useState(false)
  const leaderFilter = useTableFilter()
  const cardFilter = useTableFilter()
  const leaderChartFilter = useTableFilter()
  const cardChartFilter = useTableFilter()
  const {
    hoveredCardPreview,
    handleCardMouseEnter,
    handleCardMouseLeave,
    handlePreviewMouseEnter,
    handlePreviewMouseLeave,
    handleCardTouchStart,
    handleCardTouchEnd,
    dismissPreview,
  } = useCardPreview()

  const filterLeaderChartData = (data: any[] | null) => {
    if (!data) return null
    return data.filter(leaderChartFilter.filterFn)
  }
  const filterCardChartData = (data: any[] | null) => {
    if (!data) return null
    return data.filter(cardChartFilter.filterFn)
  }

  useEffect(() => {
    if (!hasLoadedOnce.current) setLoading(true)
    // Drop stale responses: the active set tab can change (e.g. LAW -> ASH as auth
    // resolves) while requests are in flight. Without this guard a slow response for
    // the previous set overwrites the current set's panels, so e.g. the ASH tab shows
    // LAW data. apply() ignores any result once this effect has been superseded.
    let cancelled = false
    const apply = (setter: (v: any) => void) => (result: any) => { if (!cancelled) setter(result.data || result) }

    const baseParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      includeBots: String(includeBots),
      includeHumans: String(includeHumans),
      poolType: 'sealed',
    })

    const tournamentParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      poolType: 'sealed',
      tournamentOnly: 'true',
    })

    const topPlayersParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      poolType: 'sealed',
      topPlayersOnly: 'true',
    })

    const fetches: Promise<void>[] = [
      // All Players
      fetch(`/api/stats/deck-inclusion?${baseParams}`)
        .then(r => r.json()).then(apply(setCardData))
        .catch(err => console.error('Error fetching deck inclusion:', err)),
      fetch(`/api/stats/leader-selection?${baseParams}`)
        .then(r => r.json()).then(apply(setLeaderSelData))
        .catch(err => console.error('Error fetching leader selection:', err)),
    ]

    // Tournament + Top Players: only fetch if patron/admin
    if (canSeeFullStats) {
      fetches.push(
        // Tournament Players (not affected by Humans/Bots filter)
        fetch(`/api/stats/deck-inclusion?${tournamentParams}`)
          .then(r => r.json()).then(apply(setCardDataTournament))
          .catch(err => console.error('Error fetching tournament deck inclusion:', err)),
        fetch(`/api/stats/leader-selection?${tournamentParams}`)
          .then(r => r.json()).then(apply(setLeaderSelDataTournament))
          .catch(err => console.error('Error fetching tournament leader selection:', err)),
        // Top Players (not affected by Humans/Bots filter)
        fetch(`/api/stats/deck-inclusion?${topPlayersParams}`)
          .then(r => r.json()).then(apply(setCardDataTop))
          .catch(err => console.error('Error fetching top player deck inclusion:', err)),
        fetch(`/api/stats/leader-selection?${topPlayersParams}`)
          .then(r => r.json()).then(apply(setLeaderSelDataTop))
          .catch(err => console.error('Error fetching top player leader selection:', err)),
      )
    } else {
      setCardDataTournament(null)
      setLeaderSelDataTournament(null)
      setCardDataTop(null)
      setLeaderSelDataTop(null)
    }

    // You fetches (only if logged in, not affected by Humans/Bots filter)
    if (user?.id) {
      const youParams = new URLSearchParams({
        setCode,
        since: startDate,
        until: endDate,
        poolType: 'sealed',
        userId: user.id,
      })
      fetches.push(
        fetch(`/api/stats/deck-inclusion?${youParams}`)
          .then(r => r.json()).then(apply(setCardDataYou))
          .catch(err => console.error('Error fetching your deck inclusion:', err)),
        fetch(`/api/stats/leader-selection?${youParams}`)
          .then(r => r.json()).then(apply(setLeaderSelDataYou))
          .catch(err => console.error('Error fetching your leader selection:', err)),
      )
    } else {
      setCardDataYou(null)
      setLeaderSelDataYou(null)
    }

    Promise.all(fetches).finally(() => { if (!cancelled) { setLoading(false); hasLoadedOnce.current = true } })
    return () => { cancelled = true }
  }, [setCode, includeBots, includeHumans, startDate, endDate, user?.id, canSeeFullStats])

  // Build lookup maps
  const cardTournamentMap = useMemo(() => buildLookupMap(cardDataTournament?.cards), [cardDataTournament?.cards])
  const cardTopMap = useMemo(() => buildLookupMap(cardDataTop?.cards), [cardDataTop?.cards])
  const cardYouMap = useMemo(() => buildLookupMap(cardDataYou?.cards), [cardDataYou?.cards])
  const leaderSelTournamentMap = useMemo(() => buildLookupMap(leaderSelDataTournament?.leaders), [leaderSelDataTournament?.leaders])
  const leaderSelTopMap = useMemo(() => buildLookupMap(leaderSelDataTop?.leaders), [leaderSelDataTop?.leaders])
  const leaderSelYouMap = useMemo(() => buildLookupMap(leaderSelDataYou?.leaders), [leaderSelDataYou?.leaders])

  const handleCardSort = (key: DeckSortKey) => {
    if (cardSortKey === key) setCardSortAsc(!cardSortAsc)
    else { setCardSortKey(key); setCardSortAsc(key === 'cardName') }
  }

  const handleLeaderSelSort = (key: LeaderSelSortKey) => {
    if (leaderSelSortKey === key) setLeaderSelSortAsc(!leaderSelSortAsc)
    else { setLeaderSelSortKey(key); setLeaderSelSortAsc(key === 'cardName') }
  }

  const sortedCards = useMemo(() => {
    if (!cardData?.cards) return []
    return [...cardData.cards].sort((a, b) => {
      let cmp = 0
      switch (cardSortKey) {
        case 'cardName': cmp = a.cardName.localeCompare(b.cardName); break
        case 'rarity': cmp = (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9); break
        case 'inclusionRate': cmp = a.inclusionRate - b.inclusionRate; break
        case 'avgCopiesPlayed': cmp = a.avgCopiesPlayed - b.avgCopiesPlayed; break
        case 'poolsWithCard': cmp = a.poolsWithCard - b.poolsWithCard; break
        case 'offAspectRate': cmp = a.offAspectRate - b.offAspectRate; break
      }
      return cardSortAsc ? cmp : -cmp
    })
  }, [cardData?.cards, cardSortKey, cardSortAsc])

  const sortedLeaderSel = useMemo(() => {
    if (!leaderSelData?.leaders) return []
    return [...leaderSelData.leaders].sort((a, b) => {
      let cmp = 0
      switch (leaderSelSortKey) {
        case 'cardName': cmp = a.cardName.localeCompare(b.cardName); break
        case 'timesSelected': cmp = a.timesSelected - b.timesSelected; break
        case 'selectionRate': cmp = a.selectionRate - b.selectionRate; break
      }
      return leaderSelSortAsc ? cmp : -cmp
    })
  }, [leaderSelData?.leaders, leaderSelSortKey, leaderSelSortAsc])

  const filteredCards = useMemo(() => sortedCards.filter(cardFilter.filterFn), [sortedCards, cardFilter.search, cardFilter.activeAspects])
  const filteredLeaderSel = useMemo(() => sortedLeaderSel.filter(leaderFilter.filterFn), [sortedLeaderSel, leaderFilter.search, leaderFilter.activeAspects])

  if (loading) return <LoadingSkeleton />

  const hasCards = cardData && cardData.cards && cardData.cards.length > 0
  const hasLeaderSel = leaderSelData && leaderSelData.leaders && leaderSelData.leaders.length > 0

  if (!hasCards && !hasLeaderSel) {
    return (
      <div className="stats-empty">
        <p>No sealed data available for {setCode} yet.</p>
        <p>Sealed statistics will appear after players build decks from sealed pools.</p>
      </div>
    )
  }

  const rarityClass = (r: string) => `rarity-${r.toLowerCase()}`
  const cellProps = { showYou, showAll, showTop, showTournament, isBlurred, user }

  const CardSortHeader = ({ label, col, title }: { label: string, col: DeckSortKey, title?: string }) => (
    <th className={`sortable ${cardSortKey === col ? 'active' : ''}`} onClick={() => handleCardSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardSort(col) } }} tabIndex={0} aria-sort={cardSortKey === col ? (cardSortAsc ? 'ascending' : 'descending') : 'none'} title={title}>
      {label}{cardSortKey === col && <span className="sort-indicator">{cardSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )
  const LeaderSelSortHeader = ({ label, col, title }: { label: string, col: LeaderSelSortKey, title?: string }) => (
    <th className={`sortable ${leaderSelSortKey === col ? 'active' : ''}`} onClick={() => handleLeaderSelSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLeaderSelSort(col) } }} tabIndex={0} aria-sort={leaderSelSortKey === col ? (leaderSelSortAsc ? 'ascending' : 'descending') : 'none'} title={title}>
      {label}{leaderSelSortKey === col && <span className="sort-indicator">{leaderSelSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )

  return (
    <div className="cards-subtab">
      {/* Charts (data visualizations first) */}
      <div className="stats-charts-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <h4>Leader Deck Selection <span className="stats-chart-subtitle">How often each leader is chosen for built decks</span></h4>
        <ChartFilter
          {...leaderChartFilter}
          includeHumans={includeHumans}
          includeBots={includeBots}
          onToggleHumans={legendProps.onToggleHumans}
          onToggleBots={legendProps.onToggleBots}
        />
        <LeaderCharts
          allData={filterLeaderChartData(leaderSelData?.leaders || null)}
          tournamentData={filterLeaderChartData(leaderSelDataTournament?.leaders || null)}
          topData={filterLeaderChartData(leaderSelDataTop?.leaders || null)}
          youData={filterLeaderChartData(leaderSelDataYou?.leaders || null)}
          valueKey="timesSelected"
          canSeeFullStats={canSeeFullStats}
          user={user}
        />
        <h4>Cards by Deck Inclusion <span className="stats-chart-subtitle">Most frequently included cards in built decks</span></h4>
        <ChartFilter
          {...cardChartFilter}
          includeHumans={includeHumans}
          includeBots={includeBots}
          onToggleHumans={legendProps.onToggleHumans}
          onToggleBots={legendProps.onToggleBots}
        />
        <CardCharts
          allData={filterCardChartData(cardData?.cards || null)}
          tournamentData={filterCardChartData(cardDataTournament?.cards || null)}
          topData={filterCardChartData(cardDataTop?.cards || null)}
          youData={filterCardChartData(cardDataYou?.cards || null)}
          valueKey="inclusionRate"
          formatValue={(v: number) => `${v.toFixed(1)}%`}
          canSeeFullStats={canSeeFullStats}
          user={user}
          onCardHover={(card, e) => handleCardMouseEnter(card, e)}
          onCardLeave={handleCardMouseLeave}
        />
      </div>

      {/* Off-Aspect Inclusion Chart */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Off-Aspect Inclusions</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          When a card is included in a deck, how often is it played out of aspect (with a +2 penalty)?
        </p>
        <CardCharts
          allData={filterCardChartData(cardData?.cards || null)}
          tournamentData={filterCardChartData(cardDataTournament?.cards || null)}
          topData={filterCardChartData(cardDataTop?.cards || null)}
          youData={filterCardChartData(cardDataYou?.cards || null)}
          valueKey="offAspectRate"
          formatValue={(v: number) => `${v.toFixed(1)}%`}
          canSeeFullStats={canSeeFullStats}
          user={user}
          onCardHover={(card, e) => handleCardMouseEnter(card, e)}
          onCardLeave={handleCardMouseLeave}
        />
      </div>

      {/* Leader Selection */}
      {hasLeaderSel && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Leaders</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            How often each leader is chosen for sealed decks ({fmt(leaderSelData.totalDecks)} decks built)
          </p>
          <StatsLegend {...legendProps} showBuiltDeckFilter={false} />
          <TableFilter {...leaderFilter} />
          <div className="stats-table-container" style={{ marginBottom: '2rem' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <LeaderSelSortHeader label="Leader" col="cardName" />
                  <th className="aspects-col">Aspects</th>
                  <th>Rarity</th>
                  <LeaderSelSortHeader label="Included %" col="selectionRate" title="Percentage of sealed decks that chose this leader" />
                  <LeaderSelSortHeader label="# Included" col="timesSelected" />
                </tr>
              </thead>
              <tbody>
                {filteredLeaderSel.map(leader => {
                  const tournamentLeader = leaderSelTournamentMap.get(leader.cardName)
                  const topLeader = leaderSelTopMap.get(leader.cardName)
                  const youLeader = leaderSelYouMap.get(leader.cardName)
                  return (
                    <tr key={leader.cardId}>
                      <td
                        className="card-name-cell"
                        onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: leader.imageUrl || undefined, backImageUrl: leader.backImageUrl || undefined, name: leader.cardName, rarity: leader.rarity || 'Legendary', isLeader: true }, e)}
                        onMouseLeave={handleCardMouseLeave}
                        onTouchStart={() => handleCardTouchStart({ imageUrl: leader.imageUrl || undefined, backImageUrl: leader.backImageUrl || undefined, name: leader.cardName, rarity: leader.rarity || 'Legendary', isLeader: true })}
                        onTouchEnd={handleCardTouchEnd}
                      >
                        <span className="card-name">{leader.cardName}</span>
                        {leader.subtitle && <span className="card-subtitle">{leader.subtitle}</span>}
                      </td>
                      <AspectsCell aspects={leader.aspects} />
                      <td><span className={rarityClass(leader.rarity || 'Legendary')}>{leader.rarity || 'Legendary'}</span></td>
                      <StatsCell
                        {...cellProps}
                        you={youLeader?.selectionRate}
                        all={leader.selectionRate}
                        top={topLeader?.selectionRate}
                        tournament={tournamentLeader?.selectionRate}
                        format={(v: number) => `${v.toFixed(1)}%`}
                        deltaMode="pct"
                      />
                      <StatsCell
                        {...cellProps}
                        you={youLeader ? `${fmt(youLeader.timesSelected)}/${fmt(leaderSelDataYou?.totalDecks || 0)}` : null}
                        all={`${fmt(leader.timesSelected)}/${fmt(leaderSelData?.totalDecks || 0)}`}
                        top={topLeader ? `${fmt(topLeader.timesSelected)}/${fmt(leaderSelDataTop?.totalDecks || 0)}` : null}
                        tournament={tournamentLeader ? `${fmt(tournamentLeader.timesSelected)}/${fmt(leaderSelDataTournament?.totalDecks || 0)}` : null}
                      />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Card Inclusion */}
      {hasCards && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Cards</h3>
          <div className="draft-picks-summary">
            <div className="stat-item">
              <span className="stat-label">Decks Built:</span>
              <span className="stat-value">{fmt(cardData.totalPoolsWithDecks)}</span>
            </div>
          </div>

          {cardData.totalPoolsWithDecks < 20 && (
            <p className="stats-warning">
              Small sample size ({fmt(cardData.totalPoolsWithDecks)} pools with built decks). Statistics may not be reliable yet.
            </p>
          )}

          <StatsLegend {...legendProps} showBuiltDeckFilter={false} />
          <TableFilter {...cardFilter} />
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <CardSortHeader label="Name" col="cardName" />
                  <th className="aspects-col">Aspects</th>
                  <CardSortHeader label="Rarity" col="rarity" />
                  <CardSortHeader label="Inclusion %" col="inclusionRate" title="When this card is in your pool, how often does it make your deck?" />
                  <CardSortHeader label="Off-Aspect %" col="offAspectRate" title="When this card is included in a deck, how often is it played out of aspect (with a +2 penalty)?" />
                  <CardSortHeader label="Avg Copies" col="avgCopiesPlayed" title="When you include this card, how many copies do you run?" />
                  <CardSortHeader label="# Included" col="decksWithCard" title="Times included in a deck out of total pools with this card" />
                  <th title="Top 3 leaders this card is most synergistic with (highest inclusion delta vs overall)">Top Leaders</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(card => {
                  const tournamentCard = cardTournamentMap.get(card.cardName)
                  const topCard = cardTopMap.get(card.cardName)
                  const youCard = cardYouMap.get(card.cardName)
                  return (
                    <tr key={card.cardId}>
                      <td
                        className="card-name-cell"
                        onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: card.imageUrl || undefined, name: card.cardName, rarity: card.rarity }, e)}
                        onMouseLeave={handleCardMouseLeave}
                        onTouchStart={() => handleCardTouchStart({ imageUrl: card.imageUrl || undefined, name: card.cardName, rarity: card.rarity })}
                        onTouchEnd={handleCardTouchEnd}
                      >
                        <span className="card-name">{card.cardName}</span>
                        {card.subtitle && <span className="card-subtitle">{card.subtitle}</span>}
                      </td>
                      <AspectsCell aspects={card.aspects} />
                      <td><span className={rarityClass(card.rarity)}>{card.rarity}</span></td>
                      <StatsCell
                        {...cellProps}
                        you={youCard?.inclusionRate}
                        all={card.inclusionRate}
                        top={topCard?.inclusionRate}
                        tournament={tournamentCard?.inclusionRate}
                        format={(v: number) => `${v.toFixed(1)}%`}
                        deltaMode="pct"
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.offAspectRate}
                        all={card.offAspectRate}
                        top={topCard?.offAspectRate}
                        tournament={tournamentCard?.offAspectRate}
                        format={(v: number) => `${v.toFixed(1)}%`}
                        deltaMode="pct"
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.avgCopiesPlayed}
                        all={card.avgCopiesPlayed}
                        top={topCard?.avgCopiesPlayed}
                        tournament={tournamentCard?.avgCopiesPlayed}
                        format={(v: number) => v.toFixed(1)}
                        deltaMode="num"
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard ? `${fmt(youCard.decksWithCard)}/${fmt(youCard.poolsWithCard)}` : null}
                        all={`${fmt(card.decksWithCard)}/${fmt(card.poolsWithCard)}`}
                        top={topCard ? `${fmt(topCard.decksWithCard)}/${fmt(topCard.poolsWithCard)}` : null}
                        tournament={tournamentCard ? `${fmt(tournamentCard.decksWithCard)}/${fmt(tournamentCard.poolsWithCard)}` : null}
                      />
                      <td className="top-leaders-cell">
                        {(card.topLeaders || []).map((l, i) => (
                          <span key={i} className="synergy-leader" title={`Synergy: +${l.synergy.toFixed(2)} copies/deck vs average`}>
                            {l.leaderName}{i < (card.topLeaders?.length || 0) - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Leader Synergy Cards */}
      {cardData?.leaderSynergies && cardData.leaderSynergies.length > 0 && (
        <>
          <h3 style={{ marginBottom: '0.5rem', marginTop: '2rem' }}>Leader Synergies</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Top 5 high-synergy cards per leader (synergy = extra copies per deck above average)
          </p>
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Leader</th>
                  <th>Decks</th>
                  <th>Top Synergy Cards</th>
                </tr>
              </thead>
              <tbody>
                {cardData.leaderSynergies.map(leader => (
                  <tr key={leader.leaderName}>
                    <td
                      className="card-name-cell"
                      onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: leader.leaderImageUrl || undefined, name: leader.leaderName, rarity: 'Rare' }, e)}
                      onMouseLeave={handleCardMouseLeave}
                      onTouchStart={() => handleCardTouchStart({ imageUrl: leader.leaderImageUrl || undefined, name: leader.leaderName, rarity: 'Rare' })}
                      onTouchEnd={handleCardTouchEnd}
                    >
                      <span className="card-name">{leader.leaderName}</span>
                      {leader.leaderSubtitle && <span className="card-subtitle">{leader.leaderSubtitle}</span>}
                    </td>
                    <td>{fmt(leader.deckCount)}</td>
                    <td>
                      {leader.topSynergyCards.map((c, i) => (
                        <span key={i} className="synergy-card-tag" title={`+${c.synergy.toFixed(2)} copies/deck above average`}>
                          {c.cardName} <span className="synergy-value">+{c.synergy.toFixed(2)}</span>
                          {i < leader.topSynergyCards.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hoveredCardPreview && (
        <CardPreview
          card={hoveredCardPreview.card}
          x={hoveredCardPreview.x}
          y={hoveredCardPreview.y}
          isMobile={hoveredCardPreview.isMobile}
          onMouseEnter={handlePreviewMouseEnter}
          onMouseLeave={handlePreviewMouseLeave}
          onDismiss={dismissPreview}
        />
      )}
    </div>
  )
}
