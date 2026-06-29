// @ts-nocheck
'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useCardPreview } from '@/src/hooks/useCardPreview'
import { useStickyTab } from '@/src/hooks/useStickyTab'
import { CardPreview } from '@/src/components/DeckBuilder/CardPreview'
import { CardPreviewProvider, CardName } from '@/src/components/CardNamePreview'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import Modal from '@/src/components/Modal'
import PluginCTA from '@/src/components/PluginCTA'
import { AspectIcon, ASPECTS } from '@/src/components/AspectIcon'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import { LeaderCharts, CardCharts } from './StatsCharts'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
import { PATREON_URL } from '@/src/utils/membership'
import {
  DEFAULT_STATS_SET_TAB,
  getStatsSetTabs,
  STATS_SET_COLORS,
} from '@/src/utils/statsSetTabs'
import { computeCardGrades } from '@/src/services/cardDataMetrics'
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

// === Table filter: search + aspect icons ===

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const FILTER_OPTIONS = [...ASPECTS, 'Neutral', 'Multicolor']

function useTableFilter(startAllOn = true) {
  const [search, setSearch] = useState('')
  const [activeAspects, setActiveAspects] = useState<Set<string>>(startAllOn ? new Set(FILTER_OPTIONS) : new Set())

  const toggleAspect = (aspect: string) => {
    setActiveAspects(prev => {
      const next = new Set(prev)
      if (next.has(aspect)) {
        next.delete(aspect)
      } else {
        next.add(aspect)
      }
      return next
    })
  }

  const clearAll = () => setActiveAspects(new Set())

  const filterFn = (card: { cardName: string; subtitle?: string | null; aspects: string[] }) => {
    // Name search
    if (search && !`${card.cardName} ${card.subtitle || ''}`.toLowerCase().includes(search.toLowerCase())) return false
    // Aspect filter — no active aspects = nothing matches
    if (activeAspects.size === 0) return false
    // All on = show everything
    if (activeAspects.size >= FILTER_OPTIONS.length) return true

    const cardColorAspects = card.aspects.filter(a => COLOR_ASPECTS.includes(a))
    const isNeutral = cardColorAspects.length === 0
    const isMulticolor = cardColorAspects.length >= 2

    let hasMatch = false
    if (card.aspects.some(a => activeAspects.has(a))) hasMatch = true
    if (activeAspects.has('Neutral') && isNeutral) hasMatch = true
    if (activeAspects.has('Multicolor') && isMulticolor) hasMatch = true

    return hasMatch
  }

  return { search, setSearch, activeAspects, toggleAspect, clearAll, filterFn }
}

function AspectFilterButtons({ activeAspects, toggleAspect, clearAll }: { activeAspects: Set<string>; toggleAspect: (a: string) => void; clearAll?: () => void }) {
  return (
    <div className="stats-aspect-filter">
      {ASPECTS.map(aspect => (
        <button
          key={aspect}
          className={`stats-aspect-btn ${activeAspects.has(aspect) ? 'active' : ''}`}
          onClick={() => toggleAspect(aspect)}
          title={aspect}
        >
          <AspectIcon aspect={aspect} size="sm" />
        </button>
      ))}
      <button
        className={`stats-aspect-btn stats-aspect-btn-text ${activeAspects.has('Neutral') ? 'active' : ''}`}
        onClick={() => toggleAspect('Neutral')}
        title="Neutral (no color aspects)"
      >
        <span className="stats-aspect-label">N</span>
      </button>
      <button
        className={`stats-aspect-btn stats-aspect-btn-text stats-aspect-btn-multi ${activeAspects.has('Multicolor') ? 'active' : ''}`}
        onClick={() => toggleAspect('Multicolor')}
        title="Multicolor (2+ color aspects)"
      >
        <span className="stats-aspect-label">M</span>
      </button>
      {clearAll && (
        <button
          className="stats-aspect-btn stats-aspect-btn-text"
          onClick={clearAll}
          title="Clear all filters"
          style={{ fontSize: '0.7rem', opacity: 0.7 }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

function TableFilter({ search, setSearch, activeAspects, toggleAspect, clearAll, placeholder = 'Search cards...' }: {
  search: string
  setSearch: (s: string) => void
  activeAspects: Set<string>
  toggleAspect: (a: string) => void
  clearAll?: () => void
  placeholder?: string
}) {
  return (
    <div className="stats-table-filter">
      <input
        type="text"
        placeholder={placeholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="stats-search-input"
      />
      <AspectFilterButtons activeAspects={activeAspects} toggleAspect={toggleAspect} clearAll={clearAll} />
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

// === Aspects cell helper ===

function AspectsCell({ aspects }: { aspects: string[] }) {
  return (
    <td>
      <div className="aspects-cell">
        {aspects.map((aspect, i) => (
          <img key={i} src={`/icons/${aspect.toLowerCase()}.png`} alt={aspect} className="aspect-icon" />
        ))}
      </div>
    </td>
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
        {user && (
          <button
            className="stats-export-btn"
            onClick={() => {
              window.location.href = '/api/export/personal'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Personal Data
          </button>
        )}
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
          className={`stats-subtab ${subTab === 'sealed' ? 'active' : ''}`}
          onClick={() => setSubTab('sealed')}
        >
          Sealed
        </button>
        <button
          className={`stats-subtab ${subTab === 'draft' ? 'active' : ''}`}
          onClick={() => setSubTab('draft')}
        >
          Draft
        </button>
      </div>

      {subTab === 'cards' ? (
        <CardDataTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} canSeeFullStats={canSeeFullStats} />
      ) : subTab === 'sealed' ? (
        <SealedTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} canSeeFullStats={canSeeFullStats} />
      ) : (
        <DraftTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} canSeeFullStats={canSeeFullStats} />
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

interface CardDataCard {
  cardName: string
  cardId: string | null
  subtitle: string | null
  rarity: string
  cardType: string
  aspects: string[]
  cost: number | null
  imageUrl: string | null
  backImageUrl?: string | null
  isLeader?: boolean
  isBase?: boolean
  grade: string | null
  gradeBasis: string
  gradeStatus: string
  gradeStatusLabel: string
  deckCount: number
  rawCopies: number
  gpCount: number
  gpWins: number
  gpWr: number | null
  ohCount: number | null
  ohWr: number | null
  gdCount: number | null
  gdWr: number | null
  gihCount: number | null
  gihWr: number | null
  gnsCount: number | null
  gnsWr: number | null
  iih: number | null
  playedRate: number | null
  resourcedWhenSeen: number | null
  playedWar: number | null
  sampleWarning: string | null
}

interface CardDataStats {
  setCode: string
  format: string
  source: string
  totalDecks: number
  totalMatches: number
  onlineLinkedDecks: number
  replayMetricsStatus: string
  gradeBasis: string
  leaders?: CardDataCard[]
  bases?: CardDataCard[]
  cards: CardDataCard[]
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
type CardDataSortKey = 'cardName' | 'grade' | 'rarity' | 'gpWr' | 'gpCount' | 'deckCount' | 'rawCopies'
type CardDataView = 'table' | 'tiers'
type CardMetricKey = 'gihWr' | 'ohWr' | 'gdWr' | 'gpWr'
type LeaderSortKey = 'cardName' | 'avgPickPosition' | 'firstPickPct' | 'timesPicked'
type LeaderSelSortKey = 'cardName' | 'timesSelected' | 'selectionRate'

const RARITY_ORDER: Record<string, number> = { 'Legendary': 0, 'Rare': 1, 'Uncommon': 2, 'Common': 3 }
const GRADE_ORDER: Record<string, number> = {
  'A+': 12, A: 11, 'A-': 10,
  'B+': 9, B: 8, 'B-': 7,
  'C+': 6, C: 5, 'C-': 4,
  'D+': 3, D: 2, 'D-': 1,
  F: 0, U: -1,
}
const CARD_TIER_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'U']
const STATS_SUBTABS = ['cards', 'sealed', 'draft'] as const
type StatsSubTab = typeof STATS_SUBTABS[number]
const STATS_SUBTAB_PARAM = 'tab'
const CARD_DATA_VIEW_PARAM = 'view'
const RARITY_ICON_PATHS: Record<string, string> = {
  Common: '/icons/rarity/common.png',
  Uncommon: '/icons/rarity/uncommon.png',
  Rare: '/icons/rarity/rare.png',
  Legendary: '/icons/rarity/legendary.png',
  Special: '/icons/rarity/special.png',
}
const GRADE_METRIC_OPTIONS: Array<{ key: CardMetricKey; label: string; fullLabel: string; description: string }> = [
  { key: 'gihWr', label: 'GIH WR', fullLabel: 'Games In Hand Win Rate (GIH WR)', description: 'Games in hand win rate.' },
  { key: 'ohWr', label: 'OH WR', fullLabel: 'Opening Hand Win Rate (OH WR)', description: 'Opening hand win rate.' },
  { key: 'gdWr', label: 'GD WR', fullLabel: 'Games Drawn Win Rate (GD WR)', description: 'Drawn later win rate.' },
  { key: 'gpWr', label: 'GP WR', fullLabel: 'Games Played Win Rate (GP WR)', description: 'Games played win rate.' },
]

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

function CardDataLoadingSkeleton() {
  return (
    <div className="card-data-tier-card-shell">
      <div className="card-data-section-header">
        <div>
          <SkeletonBlock width="180px" height={18} />
          <SkeletonBlock width="320px" height={12} />
        </div>
        <SkeletonBlock width="140px" height={12} />
      </div>
      <div className="card-data-tier-list">
        {['A+', 'A', 'B+', 'B'].map((grade) => (
          <div className="card-data-tier-row" key={grade}>
            <div className="card-data-tier-label">{grade}</div>
            <div className="card-data-tier-cards">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-data-tier-card card-data-tier-card-loading">
                  <SkeletonBlock width="70%" height={14} />
                  <SkeletonBlock width="44%" height={12} />
                </div>
              ))}
            </div>
          </div>
        ))}
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

function cardDataLookupKey(item: Pick<CardDataCard, 'cardName' | 'subtitle' | 'cardType'>): string {
  return `${item.cardName}|${item.subtitle || ''}|${item.cardType || ''}`
}

function RarityIcon({ rarity }: { rarity: string }) {
  const src = RARITY_ICON_PATHS[rarity]
  if (!src) {
    return <span className="card-data-rarity-icon card-data-rarity-icon-missing" aria-label={rarity} title={rarity} />
  }

  return (
    <img
      className="card-data-rarity-icon"
      src={src}
      alt={rarity}
      title={rarity}
      loading="lazy"
    />
  )
}

function CardDataMetricDefinitions() {
  return (
    <details className="card-data-definitions">
      <summary>
        <span>Metric Definitions</span>
        <span className="card-data-definitions-link">Card data terms</span>
      </summary>
      <div className="card-data-definitions-grid">
        <section className="card-data-definition-group">
          <h4>Win Rates</h4>
          <dl>
            <div className="card-data-definition-row">
              <dt>GP WR</dt>
              <dd>Wins with this card in the deck divided by games with this card in the deck.</dd>
            </div>
            <div className="card-data-definition-row">
              <dt>OH WR</dt>
              <dd>Wins when this card starts in opening hand divided by opening hands containing it.</dd>
            </div>
            <div className="card-data-definition-row">
              <dt>GD WR</dt>
              <dd>Wins when this card is drawn after the opener divided by later draws of this card.</dd>
            </div>
          </dl>
        </section>
        <section className="card-data-definition-group">
          <h4>Replay Metrics</h4>
          <dl>
            <div className="card-data-definition-row">
              <dt>GIH WR</dt>
              <dd>Wins when this card is seen in hand: opening hand plus later draws.</dd>
            </div>
            <div className="card-data-definition-row">
              <dt>GNS WR</dt>
              <dd>Wins when this card is in deck but not seen in hand.</dd>
            </div>
            <div className="card-data-definition-row">
              <dt>IIH</dt>
              <dd>Improvement in hand: GIH WR minus GNS WR.</dd>
            </div>
          </dl>
        </section>
      </div>
    </details>
  )
}

function cardDataMetricOption(metric: CardMetricKey) {
  return GRADE_METRIC_OPTIONS.find(option => option.key === metric)
}

function cardDataMetricLabel(metric: CardMetricKey) {
  return cardDataMetricOption(metric)?.label || 'GP WR'
}

function cardDataMetricFullLabel(metric: CardMetricKey) {
  const option = cardDataMetricOption(metric)
  return option?.fullLabel || option?.label || 'Games Played Win Rate (GP WR)'
}

function formatCardDataPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`
}

function formatSignedCardDataPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${formatCardDataPct(value)}`
}

function cardDataGamesLabel(count: number | null | undefined) {
  const rounded = Math.round(count || 0)
  return `${fmt(rounded)} ${rounded === 1 ? 'game' : 'games'}`
}

function cardDataTileImageUrl(card: CardDataCard) {
  return card.isLeader
    ? (card.backImageUrl || card.imageUrl)
    : (card.imageUrl || card.backImageUrl)
}

function cardDataTileKind(card: CardDataCard) {
  const type = (card.cardType || '').toLowerCase()
  if (type.includes('base')) return 'base'
  if (type.includes('event')) return 'event'
  return 'unit'
}

function CardDataLockIcon() {
  return (
    <span className="card-data-gate-lock" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  )
}

function CardDataGateOverlay({ state, requirements }: {
  state: 'checking' | 'install' | 'login' | 'play'
  requirements: Array<{ label: string; met: boolean | null }>
}) {
  const title = state === 'checking'
    ? 'Checking card stats access'
    : 'Card stats are locked'
  const copy = state === 'play'
    ? 'You have to give to get! Record one game with the Companion, then these stats unlock here.'
    : 'You have to give to get! Install the Companion, sign in, and record one game to view these stats.'

  return (
    <div className="card-data-gate-overlay" role="region" aria-label="Card stats access requirements">
      <div className="card-data-gate-panel">
        <CardDataLockIcon />
        <div className="card-data-gate-copy">
          <h3>{title}</h3>
          <p>{copy}</p>
        </div>
        <div className="card-data-gate-requirements" aria-label="Requirements">
          {requirements.map(requirement => (
            <div key={requirement.label} className={`card-data-gate-requirement ${requirement.met ? 'complete' : 'missing'}`}>
              <span className="card-data-gate-status" aria-hidden="true" />
              <span>{requirement.label}</span>
              <strong>{requirement.met ? 'Done' : state === 'checking' && requirement.met == null ? 'Checking' : 'Required'}</strong>
            </div>
          ))}
        </div>
        {state === 'install' ? (
          <PluginCTA
            required
            variant="autodetect"
            className="card-data-gate-plugin-cta"
            heading="Download Wayfinder Companion"
            copy="Install it, sign in, and record one game to unlock card stats."
          />
        ) : state === 'play' ? (
          <a className="card-data-gate-link" href="https://karabast.net" target="_blank" rel="noreferrer">
            Start on Karabast
          </a>
        ) : state === 'login' ? (
          <p className="card-data-gate-note">Open the Companion extension and sign in, then refresh this page.</p>
        ) : (
          <p className="card-data-gate-note">Reading your Companion status.</p>
        )}
      </div>
    </div>
  )
}

function CardDataModalStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card-data-stats-modal-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

function CardDataStatsModal({ card, onClose, activeMetricLabel, formatLabel }: {
  card: CardDataCard
  onClose: () => void
  activeMetricLabel: string
  formatLabel: string
}) {
  const artUrl = cardDataTileImageUrl(card)
  const grade = card.displayGrade || card.grade || 'U'
  const metricStats = [
    { label: 'Games Played WR', value: formatCardDataPct(card.gpWr), detail: cardDataGamesLabel(card.gpCount) },
    { label: 'Opening Hand WR', value: formatCardDataPct(card.ohWr), detail: card.ohCount == null ? undefined : cardDataGamesLabel(card.ohCount) },
    { label: 'Games Drawn WR', value: formatCardDataPct(card.gdWr), detail: card.gdCount == null ? undefined : cardDataGamesLabel(card.gdCount) },
    { label: 'Games In Hand WR', value: formatCardDataPct(card.gihWr), detail: card.gihCount == null ? undefined : cardDataGamesLabel(card.gihCount) },
    { label: 'Games Not Seen WR', value: formatCardDataPct(card.gnsWr), detail: card.gnsCount == null ? undefined : cardDataGamesLabel(card.gnsCount) },
    { label: 'Improvement In Hand', value: formatSignedCardDataPct(card.iih) },
    { label: 'Played Rate', value: formatCardDataPct(card.playedRate), detail: 'when seen' },
    { label: 'Resourced When Seen', value: formatCardDataPct(card.resourcedWhenSeen) },
    { label: 'Decks', value: fmt(card.deckCount || 0), detail: `${fmt(card.rawCopies || 0)} copies` },
  ]

  if (card.playedWar != null) {
    metricStats.push({ label: 'Played WAR', value: formatSignedCardDataPct(card.playedWar) })
  }

  return (
    <Modal isOpen onClose={onClose} showCloseButton className="card-data-stats-modal">
      <div className={`card-data-stats-modal-hero card-data-stats-modal-hero-${cardDataTileKind(card)}`} style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}>
        <div className="card-data-stats-modal-hero-copy">
          <span className="card-data-stats-modal-eyebrow">Card Stats</span>
          <h3>{card.cardName}</h3>
          {card.subtitle ? <p>{card.subtitle}</p> : null}
          <div className="card-data-stats-modal-meta">
            <span>{formatLabel}</span>
            <span>{activeMetricLabel}</span>
            <span className="card-data-stats-modal-rarity"><RarityIcon rarity={card.rarity} /></span>
          </div>
        </div>
        <span className={`card-grade card-grade-${grade.replace('+', 'plus').replace('-', 'minus').toLowerCase()}`}>
          {grade}
        </span>
      </div>
      <div className="card-data-stats-modal-body">
        <div className="card-data-stats-modal-grid">
          {metricStats.map(stat => (
            <CardDataModalStat key={stat.label} {...stat} />
          ))}
        </div>
        {card.sampleWarning ? <p className="card-data-stats-modal-warning">{card.sampleWarning}</p> : null}
      </div>
    </Modal>
  )
}

// === Card Data Tab ===

function CardDataTab({ setCode, includeBots, includeHumans, startDate, endDate }: TabProps) {
  const [cardData, setCardData] = useState<CardDataStats | null>(null)
  const [format, setFormat] = useState<'all' | 'sealed' | 'draft'>('draft')
  const [loading, setLoading] = useState(true)
  const hasLoadedOnce = useRef(false)
  const [view, setView] = useState<CardDataView>('tiers')
  const [selectedMetric, setSelectedMetric] = useState<CardMetricKey>('gihWr')
  const [selectedCard, setSelectedCard] = useState<CardDataCard | null>(null)
  const [sortKey, setSortKey] = useState<CardDataSortKey>('grade')
  const [sortAsc, setSortAsc] = useState(false)
  const [hasRecordedGame, setHasRecordedGame] = useState(false)
  const [presenceLoading, setPresenceLoading] = useState(true)
  const { detected: wayfinderDetected, settled: wayfinderSettled, pluginLoggedIn } = useWayfinderDetection()
  const cardFilter = useTableFilter()
  const source = 'online'

  useEffect(() => {
    const requestedView = getUrlSearchParam(CARD_DATA_VIEW_PARAM)
    if (requestedView === 'table' || requestedView === 'tiers') {
      setView(requestedView)
    }
  }, [])

  const setCardDataView = (next: CardDataView) => {
    setView(next)
    replaceUrlSearchParam(CARD_DATA_VIEW_PARAM, next === 'tiers' ? null : next)
  }

  useEffect(() => {
    let cancelled = false
    const forcedActivity = getUrlSearchParam('wfactivity')
    if (forcedActivity === '1' || forcedActivity === 'true') {
      setHasRecordedGame(true)
      setPresenceLoading(false)
      return () => { cancelled = true }
    }
    if (forcedActivity === '0' || forcedActivity === 'false') {
      setHasRecordedGame(false)
      setPresenceLoading(false)
      return () => { cancelled = true }
    }

    fetch('/api/me/wayfinder-presence', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(body => { if (!cancelled) setHasRecordedGame(Boolean(body?.data?.hasActivity)) })
      .catch(() => { if (!cancelled) setHasRecordedGame(false) })
      .finally(() => { if (!cancelled) setPresenceLoading(false) })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!hasLoadedOnce.current) setLoading(true)
    let cancelled = false
    const apply = (setter: (v: any) => void) => (result: any) => { if (!cancelled) setter(result.data || result) }

    const baseParams = new URLSearchParams({
      setCode,
      since: startDate,
      until: endDate,
      includeBots: String(includeBots),
      includeHumans: String(includeHumans),
      format,
      source,
    })

    fetch(`/api/stats/card-data?${baseParams}`)
      .then(r => r.json())
      .then(apply(setCardData))
      .catch(err => console.error('Error fetching card data:', err))
      .finally(() => { if (!cancelled) { setLoading(false); hasLoadedOnce.current = true } })
    return () => { cancelled = true }
  }, [setCode, includeBots, includeHumans, startDate, endDate, format, source])

  const handleSort = (key: CardDataSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'cardName') }
  }

  const sortRows = (rows: CardDataCard[] | undefined) => {
    if (!rows) return []
    return [...rows].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'cardName': cmp = a.cardName.localeCompare(b.cardName); break
        case 'grade': cmp = (GRADE_ORDER[a.displayGrade || a.grade || 'U'] ?? -1) - (GRADE_ORDER[b.displayGrade || b.grade || 'U'] ?? -1); break
        case 'rarity': cmp = (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9); break
        case 'gpWr': cmp = (a.displayMetricValue ?? metricValue(a, selectedMetric) ?? -1) - (b.displayMetricValue ?? metricValue(b, selectedMetric) ?? -1); break
        case 'gpCount': cmp = (a.displayMetricCount ?? metricCount(a, selectedMetric) ?? 0) - (b.displayMetricCount ?? metricCount(b, selectedMetric) ?? 0); break
        case 'deckCount': cmp = a.deckCount - b.deckCount; break
        case 'rawCopies': cmp = a.rawCopies - b.rawCopies; break
      }
      return sortAsc ? cmp : -cmp
    })
  }

  const makeTierGroups = (rows: CardDataCard[]) => {
    const groups = new Map<string, CardDataCard[]>()
    for (const grade of CARD_TIER_ORDER) groups.set(grade, [])
    for (const card of rows) {
      groups.get(card.displayGrade || card.grade || 'U')?.push(card)
    }
    return groups
  }

  const metricCount = (card: CardDataCard, metric: CardMetricKey) => {
    if (metric === 'ohWr') return card.ohCount
    if (metric === 'gdWr') return card.gdCount
    if (metric === 'gihWr') return card.gihCount
    return card.gpCount
  }

  const metricWins = (card: CardDataCard, metric: CardMetricKey) => {
    if (metric === 'ohWr') return card.ohWins ?? ((card.ohWr ?? null) == null || (card.ohCount ?? null) == null ? 0 : (card.ohWr * card.ohCount) / 100)
    if (metric === 'gdWr') return card.gdWins ?? ((card.gdWr ?? null) == null || (card.gdCount ?? null) == null ? 0 : (card.gdWr * card.gdCount) / 100)
    if (metric === 'gihWr') return card.gihWins ?? ((card.gihWr ?? null) == null || (card.gihCount ?? null) == null ? 0 : (card.gihWr * card.gihCount) / 100)
    return card.gpWins ?? ((card.gpWr ?? null) == null || (card.gpCount ?? null) == null ? 0 : (card.gpWr * card.gpCount) / 100)
  }

  const metricValue = (card: CardDataCard, metric: CardMetricKey) => {
    if (metric === 'ohWr') return card.ohWr
    if (metric === 'gdWr') return card.gdWr
    if (metric === 'gihWr') return card.gihWr
    return card.gpWr
  }

  const metricLabel = cardDataMetricLabel

  const rankRowsForMetric = (rows: CardDataCard[], metric: CardMetricKey) => {
    if (metric === 'gihWr' && cardData?.sourceDetail === 'wayfinder') {
      return {
        provisional: false,
        rows: rows.map(card => ({
          ...card,
          displayGrade: card.grade || null,
          displayMetricValue: metricValue(card, metric),
          displayMetricCount: metricCount(card, metric),
        })),
      }
    }

    const inputs = rows.map(card => ({
      key: cardDataLookupKey(card),
      wins: metricWins(card, metric),
      denominator: metricCount(card, metric) || 0,
    }))
    const strict = computeCardGrades(inputs)
    const provisional = computeCardGrades(inputs, { minDenominator: 1, minCards: 5 })
    const provisionalByKey = new Map(provisional.map(grade => [grade.key, grade]))
    let usedProvisional = false
    const gradeByKey = new Map(strict.map(grade => {
      if (grade.grade) return [grade.key, grade]
      const fallback = provisionalByKey.get(grade.key)
      if (fallback?.grade) {
        usedProvisional = true
        return [grade.key, fallback]
      }
      return [grade.key, grade]
    }))

    return {
      provisional: usedProvisional,
      rows: rows.map(card => {
        const key = cardDataLookupKey(card)
        const grade = gradeByKey.get(key)
        return {
          ...card,
          displayGrade: grade?.grade || null,
          displayMetricValue: metricValue(card, metric),
          displayMetricCount: metricCount(card, metric),
        }
      }),
    }
  }

  const allCardRows = useMemo(() => [
    ...(cardData?.leaders || []),
    ...(cardData?.bases || []),
    ...(cardData?.cards || []),
  ], [cardData?.leaders, cardData?.bases, cardData?.cards])

  const rankedCardRows = useMemo(() => {
    const filtered = allCardRows.filter(cardFilter.filterFn)
    const ranked = rankRowsForMetric(filtered, selectedMetric)
    const rows = sortRows(ranked.rows)
    return {
      ...ranked,
      rows,
      tierGroups: makeTierGroups(rows),
    }
  }, [
    allCardRows,
    cardData?.leaders,
    cardData?.bases,
    cardData?.cards,
    sortKey,
    sortAsc,
    selectedMetric,
    cardData?.sourceDetail,
    cardFilter.search,
    cardFilter.activeAspects,
  ])

  const hasCards = allCardRows.length > 0
  const formatPct = (v: number) => `${v.toFixed(1)}%`
  const formatPctCompact = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return '—'
    return Number.isInteger(v) ? `${v.toFixed(0)}%` : `${v.toFixed(1)}%`
  }
  const cardNameEntry = (card: CardDataCard) => ({
    name: card.cardName,
    subtitle: card.subtitle,
    imageUrl: card.imageUrl,
    backImageUrl: card.backImageUrl,
    isLeader: Boolean(card.isLeader),
    isBase: Boolean(card.isBase),
  })
  const activeMetricLabel = metricLabel(selectedMetric)
  const activeMetricFullLabel = cardDataMetricFullLabel(selectedMetric)
  const shownCount = rankedCardRows.rows.length
  const formatLabel = format === 'all' ? 'All' : format === 'sealed' ? 'Sealed' : 'Draft'
  const hasReplayMetrics = allCardRows.some(card => (card.gihCount || 0) > 0 || (card.ohCount || 0) > 0 || (card.gdCount || 0) > 0)
  const requirements = [
    { label: 'Wayfinder Companion installed and running', met: wayfinderSettled ? wayfinderDetected : null },
    { label: 'Signed in to Wayfinder Companion', met: wayfinderSettled ? pluginLoggedIn === true : null },
    { label: 'At least one game recorded', met: presenceLoading ? null : hasRecordedGame },
  ]
  const cardsUnlocked = wayfinderSettled && !presenceLoading && wayfinderDetected && pluginLoggedIn === true && hasRecordedGame
  const gateState: 'checking' | 'install' | 'login' | 'play' =
    (!wayfinderSettled || presenceLoading) ? 'checking'
    : !wayfinderDetected ? 'install'
    : pluginLoggedIn !== true ? 'login'
    : 'play'

  const SortHeader = ({ label, col, title }: { label: string, col: CardDataSortKey, title?: string }) => (
    <th className={`sortable ${sortKey === col ? 'active' : ''}`} onClick={() => handleSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col) } }} tabIndex={0} aria-sort={sortKey === col ? (sortAsc ? 'ascending' : 'descending') : 'none'} title={title}>
      {label}{sortKey === col && <span className="sort-indicator">{sortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )

  const gradeBadge = (card: CardDataCard) => {
    const grade = card.displayGrade || card.grade
    return grade ? (
      <span className={`card-grade card-grade-${grade.replace('+', 'plus').replace('-', 'minus').toLowerCase()}`} title={`${activeMetricLabel} grade`}>
        {grade}
      </span>
    ) : (
      <span className="card-grade card-grade-u" title="Ungraded">U</span>
    )
  }

  const metricTile = (card: CardDataCard) => {
    const count = card.displayMetricCount ?? metricCount(card, selectedMetric) ?? 0
    return (
      <>
        <span>{formatPctCompact(card.displayMetricValue ?? metricValue(card, selectedMetric))}</span>
        <span>{cardDataGamesLabel(count)}</span>
      </>
    )
  }

  const metricCell = (card: CardDataCard, metric: CardMetricKey) => {
    const value = metricValue(card, metric)
    const count = metricCount(card, metric)
    if (value == null) return <span className="metric-unavailable">—</span>
    return (
      <span className="card-data-metric-stack" title={`${metricLabel(metric)} sample`}>
        <span>{formatPct(value)}</span>
        <small>{cardDataGamesLabel(count)}</small>
      </span>
    )
  }

  const tileImageUrl = cardDataTileImageUrl

  const tileKind = cardDataTileKind

  const tileStyle = (card: CardDataCard) => {
    const imageUrl = tileImageUrl(card)
    return imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined
  }

  const renderTable = () => (
    <div className="stats-table-container card-data-table-container">
      <table className="stats-table card-data-table">
        <thead>
          <tr>
            <SortHeader label="Name" col="cardName" />
            <th className="aspects-col">Aspects</th>
            <SortHeader label="Rarity" col="rarity" />
            <SortHeader label="Grade" col="grade" title={`Derived from ${activeMetricLabel} within the active filters.`} />
            <SortHeader label="# Sample" col="gpCount" title="Sample for the selected metric." />
            <SortHeader label="Selected WR" col="gpWr" title={activeMetricLabel} />
            <th>GP WR</th>
            <th>OH WR</th>
            <th>GD WR</th>
            <th>GIH WR</th>
            <th>GNS WR</th>
            <th>IIH</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {rankedCardRows.rows.map((card: CardDataCard) => (
            <tr
              key={cardDataLookupKey(card)}
              className="card-data-table-row"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCard(card)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedCard(card)
                }
              }}
            >
              <td className="card-name-cell">
                <CardName entry={cardNameEntry(card)} className="card-data-name" />
              </td>
              <AspectsCell aspects={card.aspects} />
              <td><RarityIcon rarity={card.rarity} /></td>
              <td>{gradeBadge(card)}</td>
              <td>{fmt(Math.round(card.displayMetricCount ?? metricCount(card, selectedMetric) ?? 0))}</td>
              <td>{formatPctCompact(card.displayMetricValue ?? metricValue(card, selectedMetric))}</td>
              <td>{metricCell(card, 'gpWr')}</td>
              <td>{metricCell(card, 'ohWr')}</td>
              <td>{metricCell(card, 'gdWr')}</td>
              <td>{metricCell(card, 'gihWr')}</td>
              <td>{card.gnsWr == null ? <span className="metric-unavailable">—</span> : formatPct(card.gnsWr)}</td>
              <td>{card.iih == null ? <span className="metric-unavailable">—</span> : `${card.iih > 0 ? '+' : ''}${formatPct(card.iih)}`}</td>
              <td>
                {card.sampleWarning ? <span className="sample-warning">{card.sampleWarning}</span> : <span className="sample-ok">OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderTierList = () => (
    <div className="card-data-tier-list" aria-label={`${setCode} card tier list`}>
      {CARD_TIER_ORDER.map(grade => {
        const rows = rankedCardRows.tierGroups.get(grade) || []
        if (rows.length === 0) return null
        return (
          <div className="card-data-tier-row" key={grade}>
            <div className="card-data-tier-label">{grade}</div>
            <div className="card-data-tier-cards">
              {rows.map((card: CardDataCard) => {
                const imageUrl = tileImageUrl(card)
                return (
                  <button
                    type="button"
                    key={cardDataLookupKey(card)}
                    className={`card-data-tier-card card-data-tier-card-${tileKind(card)} ${imageUrl ? 'card-data-tier-card-has-art' : ''}`}
                    style={tileStyle(card)}
                    onClick={() => setSelectedCard(card)}
                  >
                    <span className="card-data-tier-card-copy">
                      <span className="card-data-tier-card-title">{card.cardName}</span>
                      {card.subtitle ? <span className="card-data-tier-card-subtitle">{card.subtitle}</span> : null}
                      <span className="card-data-tier-card-metric">{metricTile(card)}</span>
                    </span>
                    <span className="card-data-tier-card-footer">
                      <span className="card-data-tier-card-aspects">
                        {card.aspects.map((aspect) => <AspectIcon key={aspect} aspect={aspect} size="xs" />)}
                      </span>
                      <span className="card-data-tier-card-printing">
                        {card.collectorNumber ? <span>{card.collectorNumber}</span> : null}
                        <RarityIcon rarity={card.rarity} />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderCardDataContent = () => {
    if (loading) return <CardDataLoadingSkeleton />

    if (!hasCards) {
      return (
        <div className="stats-empty">
          <p>No card data available for {setCode} with these filters yet.</p>
        </div>
      )
    }

    return (
      <>
        <div className="card-data-tier-card-shell">
          <div className="card-data-section-header">
            <div>
              <h4>Cards Tier List</h4>
              <p>Grouped by {activeMetricFullLabel}</p>
            </div>
            <span>{fmt(shownCount)} / {fmt(allCardRows.length)} cards shown</span>
          </div>
          {shownCount === 0 ? (
            <div className="stats-empty card-data-section-empty">No cards match these filters.</div>
          ) : view === 'tiers' ? (
            renderTierList()
          ) : (
            renderTable()
          )}
        </div>
      </>
    )
  }

  return (
    <CardPreviewProvider>
      <div className="cards-subtab card-data-tab">
        <div className={`card-data-gated-shell ${cardsUnlocked ? '' : 'card-data-gated-shell--locked'}`.trim()}>
          <div className="card-data-gated-content" aria-hidden={!cardsUnlocked}>
            <div className="card-stats-mode-card card-data-control-panel">
              <div className="card-stats-mode-row">
                <div>
                  <div className="card-stats-mode-title">Cards</div>
                  <div className="card-data-muted">Filter the card stats view by format, metric, card name, and aspect.</div>
                </div>
                <div className="card-data-segmented card-stats-view-tabs" role="tablist" aria-label="Card stats view">
                  {[
                    ['tiers', 'Tier List'],
                    ['table', 'Table'],
                  ].map(([value, label]) => (
                    <button key={value} className={`card-data-segment ${view === value ? 'active' : ''}`} onClick={() => setCardDataView(value as CardDataView)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="card-data-controls-grid">
                <div className="card-data-control">
                  <span className="card-data-control-label">Format</span>
                  <div className="card-data-segmented">
                    {[
                      ['all', 'All'],
                      ['sealed', 'Sealed'],
                      ['draft', 'Draft'],
                    ].map(([value, label]) => (
                      <button key={value} className={`card-data-segment ${format === value ? 'active' : ''}`} onClick={() => setFormat(value as any)}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="card-data-control">
                  <span className="card-data-control-label">Metric</span>
                  <div className="card-stats-metric-pills" role="list" aria-label="Grade metric">
                    {GRADE_METRIC_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        className={`card-data-metric-pill ${selectedMetric === option.key ? 'active' : ''}`}
                        title={option.description}
                        onClick={() => setSelectedMetric(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card-data-control card-data-control--search">
                  <span className="card-data-control-label">Search</span>
                  <TableFilter {...cardFilter} placeholder="Search cards..." />
                </div>
              </div>

              <div className="card-stats-mode-row card-stats-mode-row--compact">
                <CardDataMetricDefinitions />
                <div className="card-data-muted">
                  {formatLabel} · {fmt(shownCount)} / {fmt(allCardRows.length)} cards loaded
                  {rankedCardRows.provisional ? ' · provisional grade thresholds' : ''}
                  {cardData?.sourceDetail === 'wayfinder' ? ' · Wayfinder data' : ''}
                  {!hasReplayMetrics ? ' · replay hand metrics pending' : ''}
                </div>
              </div>
            </div>

            {renderCardDataContent()}
          </div>

          {!cardsUnlocked ? <CardDataGateOverlay state={gateState} requirements={requirements} /> : null}
        </div>

        {selectedCard ? (
          <CardDataStatsModal
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            activeMetricLabel={activeMetricLabel}
            formatLabel={formatLabel}
          />
        ) : null}
      </div>
    </CardPreviewProvider>
  )
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
  const [leaderSelData, setLeaderSelData] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)
  // Tournament Players data (tournamentOnly)
  const [cardDataTournament, setCardDataTournament] = useState<DraftPickStats | null>(null)
  const [leaderDataTournament, setLeaderDataTournament] = useState<DraftPickStats | null>(null)
  const [leaderSelDataTournament, setLeaderSelDataTournament] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)
  // Top Players data (topPlayersOnly)
  const [cardDataTop, setCardDataTop] = useState<DraftPickStats | null>(null)
  const [leaderDataTop, setLeaderDataTop] = useState<DraftPickStats | null>(null)
  const [leaderSelDataTop, setLeaderSelDataTop] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)
  // You data
  const [cardDataYou, setCardDataYou] = useState<DraftPickStats | null>(null)
  const [leaderDataYou, setLeaderDataYou] = useState<DraftPickStats | null>(null)
  const [leaderSelDataYou, setLeaderSelDataYou] = useState<{ totalDecks: number; leaders: LeaderSelection[] } | null>(null)

  const [loading, setLoading] = useState(true)
  const hasLoadedOnce = useRef(false)
  const [cardSortKey, setCardSortKey] = useState<SortKey>('avgPickPosition')
  const [cardSortAsc, setCardSortAsc] = useState(true)
  const [leaderSortKey, setLeaderSortKey] = useState<LeaderSortKey>('avgPickPosition')
  const [leaderSortAsc, setLeaderSortAsc] = useState(true)
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
      fetch(`/api/stats/leader-selection?${baseParams}&poolType=draft`)
        .then(r => r.json()).then(apply(setLeaderSelData))
        .catch(err => console.error('Error fetching leader selection:', err)),
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
        fetch(`/api/stats/leader-selection?${tournamentParams}&poolType=draft`)
          .then(r => r.json()).then(apply(setLeaderSelDataTournament))
          .catch(err => console.error('Error fetching tournament leader selection:', err)),
        // Top Players (not affected by Humans/Bots filter)
        fetch(`/api/stats/draft-picks?${topPlayersParams}`)
          .then(r => r.json()).then(apply(setCardDataTop))
          .catch(err => console.error('Error fetching top player card draft picks:', err)),
        fetch(`/api/stats/draft-picks?${topPlayersParams}&type=leaders`)
          .then(r => r.json()).then(apply(setLeaderDataTop))
          .catch(err => console.error('Error fetching top player leader draft picks:', err)),
        fetch(`/api/stats/leader-selection?${topPlayersParams}&poolType=draft`)
          .then(r => r.json()).then(apply(setLeaderSelDataTop))
          .catch(err => console.error('Error fetching top player leader selection:', err)),
      )
    } else {
      setCardDataTournament(null)
      setLeaderDataTournament(null)
      setLeaderSelDataTournament(null)
      setCardDataTop(null)
      setLeaderDataTop(null)
      setLeaderSelDataTop(null)
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
        fetch(`/api/stats/leader-selection?${youParams}&poolType=draft`)
          .then(r => r.json()).then(apply(setLeaderSelDataYou))
          .catch(err => console.error('Error fetching your leader selection:', err)),
      )
    } else {
      setCardDataYou(null)
      setLeaderDataYou(null)
      setLeaderSelDataYou(null)
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
  const leaderSelTournamentMap = useMemo(() => buildLookupMap(leaderSelDataTournament?.leaders), [leaderSelDataTournament?.leaders])
  const leaderSelTopMap = useMemo(() => buildLookupMap(leaderSelDataTop?.leaders), [leaderSelDataTop?.leaders])
  const leaderSelYouMap = useMemo(() => buildLookupMap(leaderSelDataYou?.leaders), [leaderSelDataYou?.leaders])

  const handleCardSort = (key: SortKey) => {
    if (cardSortKey === key) setCardSortAsc(!cardSortAsc)
    else { setCardSortKey(key); setCardSortAsc(key === 'avgPickPosition' || key === 'cardName') }
  }

  const handleLeaderSort = (key: LeaderSortKey) => {
    if (leaderSortKey === key) setLeaderSortAsc(!leaderSortAsc)
    else { setLeaderSortKey(key); setLeaderSortAsc(key === 'avgPickPosition' || key === 'cardName') }
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
  const filteredLeaders = useMemo(() => sortedLeaders.filter(leaderFilter.filterFn), [sortedLeaders, leaderFilter.search, leaderFilter.activeAspects])
  const filteredLeaderSel = useMemo(() => sortedLeaderSel.filter(leaderFilter.filterFn), [sortedLeaderSel, leaderFilter.search, leaderFilter.activeAspects])

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
  const LeaderSelSortHeader = ({ label, col, title }: { label: string, col: LeaderSelSortKey, title?: string }) => (
    <th className={`sortable ${leaderSelSortKey === col ? 'active' : ''}`} onClick={() => handleLeaderSelSort(col)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLeaderSelSort(col) } }} tabIndex={0} aria-sort={leaderSelSortKey === col ? (leaderSelSortAsc ? 'ascending' : 'descending') : 'none'} title={title}>
      {label}{leaderSelSortKey === col && <span className="sort-indicator">{leaderSelSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )

  const hasCards = cardData && cardData.cards && cardData.cards.length > 0
  const hasLeaders = leaderData && leaderData.cards && leaderData.cards.length > 0
  const hasLeaderSel = leaderSelData && leaderSelData.leaders && leaderSelData.leaders.length > 0

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
      {(hasLeaders || hasLeaderSel) && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Leaders</h3>

          {/* Leader Draft Picks */}
          {hasLeaders && (
            <>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Draft pick order ({fmt(leaderData.totalDrafts)} drafts, {fmt(leaderData.totalPicks)} leader picks{leaderSelData ? `, ${fmt(leaderSelData.totalDecks)} decks built` : ''})
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
                      <LeaderSortHeader label="Avg Pick" col="avgPickPosition" title="Average position this leader is picked in leader rounds (1 = first pick)" />
                      <LeaderSortHeader label="1st Pick" col="firstPickPct" title="How often this leader is picked first overall in leader rounds" />
                      <LeaderSortHeader label="# Drafted" col="timesPicked" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaders.map(card => {
                      const tournamentCard = leaderTournamentMap.get(card.cardName)
                      const topCard = leaderTopMap.get(card.cardName)
                      const youCard = leaderYouMap.get(card.cardName)
                      return (
                        <tr key={card.cardId}>
                          <td
                            className="card-name-cell"
                            onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: card.imageUrl || undefined, backImageUrl: card.backImageUrl || undefined, name: card.cardName, rarity: card.rarity, isLeader: true }, e)}
                            onMouseLeave={handleCardMouseLeave}
                            onTouchStart={() => handleCardTouchStart({ imageUrl: card.imageUrl || undefined, backImageUrl: card.backImageUrl || undefined, name: card.cardName, rarity: card.rarity, isLeader: true })}
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
                            format={(v: number) => v.toFixed(1)}
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

          {/* Leader Deck Selection */}
          {hasLeaderSel && (
            <>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Deck selection rate ({fmt(leaderSelData.totalDecks)} draft decks built)
              </p>
              <StatsLegend {...legendProps} showBuiltDeckFilter={true} />
              <div className="stats-table-container" style={{ marginBottom: '2rem' }}>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <LeaderSelSortHeader label="Leader" col="cardName" />
                      <th className="aspects-col">Aspects</th>
                      <th>Rarity</th>
                      <LeaderSelSortHeader label="Selection %" col="selectionRate" title="Percentage of all built decks that chose this leader" />
                      <LeaderSelSortHeader label="# Selected" col="timesSelected" />
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
                            you={youLeader?.timesSelected}
                            all={leader.timesSelected}
                            top={topLeader?.timesSelected}
                            tournament={tournamentLeader?.timesSelected}
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
