// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useCardPreview } from '@/src/hooks/useCardPreview'
import { CardPreview } from '@/src/components/DeckBuilder/CardPreview'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
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

function StatsCell({ you, all, top, tournament, format, className, showYou, showAll, showTop, showTournament, isBlurred }: {
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
}) {
  const f = format || String
  return (
    <td className={`stats-stacked-cell ${className || ''}`}>
      {showYou && (
        <div className="stats-row-you">
          <span className="stats-row-label">You:</span> {you != null ? f(you) : '—'}
        </div>
      )}
      {showAll && (
        <div className="stats-row-all">
          <span className="stats-row-label">All:</span> {all != null ? f(all) : '—'}
        </div>
      )}
      {showTop && (
        <div className="stats-row-top">
          <span className="stats-row-label">Top:</span> {isBlurred ? <span className="stats-blur-value">{top != null ? f(top) : '—'}</span> : (top != null ? f(top) : '—')}
        </div>
      )}
      {showTournament && (
        <div className="stats-row-tournament">
          <span className="stats-row-label">Tournament:</span> {isBlurred ? <span className="stats-blur-value">{tournament != null ? f(tournament) : '—'}</span> : (tournament != null ? f(tournament) : '—')}
        </div>
      )}
    </td>
  )
}

// === StatsLegend: Toggleable You/All/Top/Tournament with filters ===

function StatsLegend({ user, showYou, showAll, showTop, showTournament, onToggleYou, onToggleAll, onToggleTop, onToggleTournament, includeBots, includeHumans, onToggleBots, onToggleHumans, isBlurred }: {
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
        <label className="stats-legend-filter">
          <input type="checkbox" checked={includeHumans} onChange={onToggleHumans} />
          Humans
        </label>
        <label className="stats-legend-filter">
          <input type="checkbox" checked={includeBots} onChange={onToggleBots} />
          Bots
        </label>
      </div>
      <span className="stats-legend-sep">&middot;</span>
      <div className="stats-legend-group">
        <label className={`stats-legend-toggle stats-legend-top ${isBlurred ? 'stats-legend-locked' : ''}`}>
          <input type="checkbox" checked={showTop} onChange={onToggleTop} disabled={isBlurred} />
          Top {isBlurred && '🔒'}
          <span className="stats-filter-info" title="Curated list of top competitive players.">
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
        <label className={`stats-legend-toggle stats-legend-tournament ${isBlurred ? 'stats-legend-locked' : ''}`}>
          <input type="checkbox" checked={showTournament} onChange={onToggleTournament} disabled={isBlurred} />
          Tournament {isBlurred && '🔒'}
          <span className="stats-filter-info" title={`${tournamentPlayerCount} app users who have competed in melee.gg tournaments (matched by username from swumetastats.com).`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
        </label>
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
  const [activeTab, setActiveTab] = useState('LAW')
  const [includeBots, setIncludeBots] = useState(false)
  const [includeHumans, setIncludeHumans] = useState(true)
  const [showYou, setShowYou] = useState(true)
  const [showAll, setShowAll] = useState(true)
  const [showTop, setShowTop] = useState(true)
  const [showTournament, setShowTournament] = useState(true)
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState(todayStr())
  const [editingStart, setEditingStart] = useState(false)
  const [editingEnd, setEditingEnd] = useState(false)
  const { user, isPatron } = useAuth()
  const canSeeFullStats = isPatron === true || user?.is_admin

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

  const tabs = ['LAW', 'SEC', 'LOF', 'JTL', 'TWI', 'SHD', 'SOR']

  const setColors: Record<string, string> = {
    'SOR': '#CC0000',
    'SHD': '#6B21A8',
    'TWI': '#0891B2',
    'JTL': '#EA580C',
    'LOF': '#16A34A',
    'SEC': '#7C3AED',
    'LAW': '#D93600'
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
        {isBlurred && (
          <div className="stats-patron-cta">
            <div className="stats-patron-cta-content">
              <div className="stats-patron-cta-text">
                <span className="stats-patron-cta-icon">🔒</span>
                <div>
                  <h3 className="stats-patron-cta-heading">Unlock Top Player Stats</h3>
                  <p className="stats-patron-cta-desc">Support Protect the Pod to see stats from top tournament competitors.</p>
                </div>
              </div>
              <a href="https://www.patreon.com/protectthepod" target="_blank" rel="noopener noreferrer">
                <Button variant="primary">Support on Patreon</Button>
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
}

function SetStatsTab({ setCode, includeBots, includeHumans, startDate, endDate, user, showYou, showAll, showTop, showTournament, legendProps, isBlurred }: SetStatsTabProps) {
  const [subTab, setSubTab] = useState('draft')

  return (
    <div className="generation-stats">
      <div className="stats-subtabs">
        <button
          className={`stats-subtab ${subTab === 'draft' ? 'active' : ''}`}
          onClick={() => setSubTab('draft')}
        >
          Draft
        </button>
        <button
          className={`stats-subtab ${subTab === 'sealed' ? 'active' : ''}`}
          onClick={() => setSubTab('sealed')}
        >
          Sealed
        </button>
      </div>

      {subTab === 'draft' ? (
        <DraftTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} />
      ) : (
        <SealedTab setCode={setCode} includeBots={includeBots} includeHumans={includeHumans} startDate={startDate} endDate={endDate} user={user} showYou={showYou} showAll={showAll} showTop={showTop} showTournament={showTournament} legendProps={legendProps} isBlurred={isBlurred} />
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
  subtitle: string | null
  cost: number | null
  imageUrl: string | null
}

interface DeckInclusionStats {
  setCode: string
  totalPoolsWithDecks: number
  cards: DeckInclusionCard[]
}

interface LeaderSelection {
  cardName: string
  cardId: string
  timesSelected: number
  selectionRate: number
  aspects: string[]
  subtitle: string | null
  imageUrl: string | null
}

type SortKey = 'cardName' | 'rarity' | 'avgPickPosition' | 'firstPickPct' | 'timesPicked'
type DeckSortKey = 'cardName' | 'rarity' | 'inclusionRate' | 'avgCopiesPlayed' | 'poolsWithCard'
type LeaderSortKey = 'cardName' | 'avgPickPosition' | 'firstPickPct' | 'timesPicked'
type LeaderSelSortKey = 'cardName' | 'timesSelected' | 'selectionRate'

const RARITY_ORDER: Record<string, number> = { 'Legendary': 0, 'Rare': 1, 'Uncommon': 2, 'Common': 3 }

// === Shared Skeleton ===

function LoadingSkeleton() {
  return (
    <div className="stats-loading-skeleton">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-line" style={{ maxWidth: '140px' }} />
          <div className="skeleton-line" style={{ maxWidth: '60px' }} />
          <div className="skeleton-line" style={{ maxWidth: '60px' }} />
          <div className="skeleton-line" style={{ maxWidth: '80px' }} />
        </div>
      ))}
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
}

function DraftTab({ setCode, includeBots, includeHumans, startDate, endDate, user, showYou, showAll, showTop, showTournament, legendProps, isBlurred }: TabProps) {
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
  const [cardSortKey, setCardSortKey] = useState<SortKey>('avgPickPosition')
  const [cardSortAsc, setCardSortAsc] = useState(true)
  const [leaderSortKey, setLeaderSortKey] = useState<LeaderSortKey>('avgPickPosition')
  const [leaderSortAsc, setLeaderSortAsc] = useState(true)
  const [leaderSelSortKey, setLeaderSelSortKey] = useState<LeaderSelSortKey>('timesSelected')
  const [leaderSelSortAsc, setLeaderSelSortAsc] = useState(false)
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

  useEffect(() => {
    setLoading(true)
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
        .then(r => r.json()).then(result => setCardData(result.data || result))
        .catch(err => console.error('Error fetching card draft picks:', err)),
      fetch(`/api/stats/draft-picks?${baseParams}&type=leaders`)
        .then(r => r.json()).then(result => setLeaderData(result.data || result))
        .catch(err => console.error('Error fetching leader draft picks:', err)),
      fetch(`/api/stats/leader-selection?${baseParams}&poolType=draft`)
        .then(r => r.json()).then(result => setLeaderSelData(result.data || result))
        .catch(err => console.error('Error fetching leader selection:', err)),
      // Tournament Players (not affected by Humans/Bots filter)
      fetch(`/api/stats/draft-picks?${tournamentParams}`)
        .then(r => r.json()).then(result => setCardDataTournament(result.data || result))
        .catch(err => console.error('Error fetching tournament card draft picks:', err)),
      fetch(`/api/stats/draft-picks?${tournamentParams}&type=leaders`)
        .then(r => r.json()).then(result => setLeaderDataTournament(result.data || result))
        .catch(err => console.error('Error fetching tournament leader draft picks:', err)),
      fetch(`/api/stats/leader-selection?${tournamentParams}&poolType=draft`)
        .then(r => r.json()).then(result => setLeaderSelDataTournament(result.data || result))
        .catch(err => console.error('Error fetching tournament leader selection:', err)),
      // Top Players (not affected by Humans/Bots filter)
      fetch(`/api/stats/draft-picks?${topPlayersParams}`)
        .then(r => r.json()).then(result => setCardDataTop(result.data || result))
        .catch(err => console.error('Error fetching top player card draft picks:', err)),
      fetch(`/api/stats/draft-picks?${topPlayersParams}&type=leaders`)
        .then(r => r.json()).then(result => setLeaderDataTop(result.data || result))
        .catch(err => console.error('Error fetching top player leader draft picks:', err)),
      fetch(`/api/stats/leader-selection?${topPlayersParams}&poolType=draft`)
        .then(r => r.json()).then(result => setLeaderSelDataTop(result.data || result))
        .catch(err => console.error('Error fetching top player leader selection:', err)),
    ]

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
          .then(r => r.json()).then(result => setCardDataYou(result.data || result))
          .catch(err => console.error('Error fetching your card draft picks:', err)),
        fetch(`/api/stats/draft-picks?${youParams}&type=leaders`)
          .then(r => r.json()).then(result => setLeaderDataYou(result.data || result))
          .catch(err => console.error('Error fetching your leader draft picks:', err)),
        fetch(`/api/stats/leader-selection?${youParams}&poolType=draft`)
          .then(r => r.json()).then(result => setLeaderSelDataYou(result.data || result))
          .catch(err => console.error('Error fetching your leader selection:', err)),
      )
    } else {
      setCardDataYou(null)
      setLeaderDataYou(null)
      setLeaderSelDataYou(null)
    }

    Promise.all(fetches).finally(() => setLoading(false))
  }, [setCode, includeBots, includeHumans, startDate, endDate, user?.id])

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

  if (loading) return <LoadingSkeleton />

  const rarityClass = (r: string) => `rarity-${r.toLowerCase()}`

  const CardSortHeader = ({ label, col, title }: { label: string, col: SortKey, title?: string }) => (
    <th className={`sortable ${cardSortKey === col ? 'active' : ''}`} onClick={() => handleCardSort(col)} title={title}>
      {label}{cardSortKey === col && <span className="sort-indicator">{cardSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )
  const LeaderSortHeader = ({ label, col, title }: { label: string, col: LeaderSortKey, title?: string }) => (
    <th className={`sortable ${leaderSortKey === col ? 'active' : ''}`} onClick={() => handleLeaderSort(col)} title={title}>
      {label}{leaderSortKey === col && <span className="sort-indicator">{leaderSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )
  const LeaderSelSortHeader = ({ label, col, title }: { label: string, col: LeaderSelSortKey, title?: string }) => (
    <th className={`sortable ${leaderSelSortKey === col ? 'active' : ''}`} onClick={() => handleLeaderSelSort(col)} title={title}>
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

  const cellProps = { showYou, showAll, showTop, showTournament, isBlurred }

  return (
    <div className="cards-subtab">
      {/* Leaders Section */}
      {(hasLeaders || hasLeaderSel) && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Leaders</h3>

          {/* Leader Draft Picks */}
          {hasLeaders && (
            <>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Draft pick order ({fmt(leaderData.totalDrafts)} drafts, {fmt(leaderData.totalPicks)} leader picks)
              </p>
              <StatsLegend {...legendProps} showBuiltDeckFilter={true} />
              <div className="stats-table-container" style={{ marginBottom: '1.5rem' }}>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <LeaderSortHeader label="Leader" col="cardName" />
                      <th>Aspects</th>
                      <LeaderSortHeader label="Avg Pick" col="avgPickPosition" title="Average position this leader is picked in leader rounds (1 = first pick)" />
                      <LeaderSortHeader label="1st Pick" col="firstPickPct" title="How often this leader is picked first overall in leader rounds" />
                      <LeaderSortHeader label="# Drafted" col="timesPicked" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaders.map(card => {
                      const tournamentCard = leaderTournamentMap.get(card.cardName)
                      const topCard = leaderTopMap.get(card.cardName)
                      const youCard = leaderYouMap.get(card.cardName)
                      return (
                        <tr key={card.cardId}>
                          <td
                            className="card-name-cell"
                            onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: card.imageUrl || undefined, name: card.cardName, rarity: card.rarity, isLeader: true }, e)}
                            onMouseLeave={handleCardMouseLeave}
                            onTouchStart={() => handleCardTouchStart({ imageUrl: card.imageUrl || undefined, name: card.cardName, rarity: card.rarity, isLeader: true })}
                            onTouchEnd={handleCardTouchEnd}
                          >
                            <span className="card-name">{card.cardName}</span>
                            {card.subtitle && <span className="card-subtitle">{card.subtitle}</span>}
                          </td>
                          <AspectsCell aspects={card.aspects} />
                          <StatsCell
                            {...cellProps}
                            you={youCard?.avgPickPosition}
                            all={card.avgPickPosition}
                            top={topCard?.avgPickPosition}
                            tournament={tournamentCard?.avgPickPosition}
                            format={(v: number) => v.toFixed(1)}
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
                      <th>Aspects</th>
                      <LeaderSelSortHeader label="Selection %" col="selectionRate" title="Percentage of all built decks that chose this leader" />
                      <LeaderSelSortHeader label="# Selected" col="timesSelected" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaderSel.map(leader => {
                      const tournamentLeader = leaderSelTournamentMap.get(leader.cardName)
                      const topLeader = leaderSelTopMap.get(leader.cardName)
                      const youLeader = leaderSelYouMap.get(leader.cardName)
                      return (
                        <tr key={leader.cardId}>
                          <td
                            className="card-name-cell"
                            onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: leader.imageUrl || undefined, name: leader.cardName, rarity: 'Legendary', isLeader: true }, e)}
                            onMouseLeave={handleCardMouseLeave}
                            onTouchStart={() => handleCardTouchStart({ imageUrl: leader.imageUrl || undefined, name: leader.cardName, rarity: 'Legendary', isLeader: true })}
                            onTouchEnd={handleCardTouchEnd}
                          >
                            <span className="card-name">{leader.cardName}</span>
                            {leader.subtitle && <span className="card-subtitle">{leader.subtitle}</span>}
                          </td>
                          <AspectsCell aspects={leader.aspects} />
                          <StatsCell
                            {...cellProps}
                            you={youLeader?.selectionRate}
                            all={leader.selectionRate}
                            top={topLeader?.selectionRate}
                            tournament={tournamentLeader?.selectionRate}
                            format={(v: number) => `${v.toFixed(1)}%`}
                          />
                          <StatsCell
                            {...cellProps}
                            you={youLeader?.timesSelected}
                            all={leader.timesSelected}
                            top={topLeader?.timesSelected}
                            tournament={tournamentLeader?.timesSelected}
                            format={fmt}
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
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <CardSortHeader label="Name" col="cardName" />
                  <th>Aspects</th>
                  <CardSortHeader label="Rarity" col="rarity" />
                  <CardSortHeader label="Avg Pick" col="avgPickPosition" title="Average position this card is picked within a pack (1 = first pick, 14 = last). Lower is better." />
                  <CardSortHeader label="1st Pick" col="firstPickPct" title="How often this card is the first pick out of a fresh pack (pick position 1 of 14)." />
                  <CardSortHeader label="# Drafted" col="timesPicked" title="Total number of times this card was drafted across all drafts." />
                </tr>
              </thead>
              <tbody>
                {sortedCards.map(card => {
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

function SealedTab({ setCode, includeBots, includeHumans, startDate, endDate, user, showYou, showAll, showTop, showTournament, legendProps, isBlurred }: TabProps) {
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
  const [cardSortKey, setCardSortKey] = useState<DeckSortKey>('inclusionRate')
  const [cardSortAsc, setCardSortAsc] = useState(false)
  const [leaderSelSortKey, setLeaderSelSortKey] = useState<LeaderSelSortKey>('timesSelected')
  const [leaderSelSortAsc, setLeaderSelSortAsc] = useState(false)
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

  useEffect(() => {
    setLoading(true)
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
        .then(r => r.json()).then(result => setCardData(result.data || result))
        .catch(err => console.error('Error fetching deck inclusion:', err)),
      fetch(`/api/stats/leader-selection?${baseParams}`)
        .then(r => r.json()).then(result => setLeaderSelData(result.data || result))
        .catch(err => console.error('Error fetching leader selection:', err)),
      // Tournament Players (not affected by Humans/Bots filter)
      fetch(`/api/stats/deck-inclusion?${tournamentParams}`)
        .then(r => r.json()).then(result => setCardDataTournament(result.data || result))
        .catch(err => console.error('Error fetching tournament deck inclusion:', err)),
      fetch(`/api/stats/leader-selection?${tournamentParams}`)
        .then(r => r.json()).then(result => setLeaderSelDataTournament(result.data || result))
        .catch(err => console.error('Error fetching tournament leader selection:', err)),
      // Top Players (not affected by Humans/Bots filter)
      fetch(`/api/stats/deck-inclusion?${topPlayersParams}`)
        .then(r => r.json()).then(result => setCardDataTop(result.data || result))
        .catch(err => console.error('Error fetching top player deck inclusion:', err)),
      fetch(`/api/stats/leader-selection?${topPlayersParams}`)
        .then(r => r.json()).then(result => setLeaderSelDataTop(result.data || result))
        .catch(err => console.error('Error fetching top player leader selection:', err)),
    ]

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
          .then(r => r.json()).then(result => setCardDataYou(result.data || result))
          .catch(err => console.error('Error fetching your deck inclusion:', err)),
        fetch(`/api/stats/leader-selection?${youParams}`)
          .then(r => r.json()).then(result => setLeaderSelDataYou(result.data || result))
          .catch(err => console.error('Error fetching your leader selection:', err)),
      )
    } else {
      setCardDataYou(null)
      setLeaderSelDataYou(null)
    }

    Promise.all(fetches).finally(() => setLoading(false))
  }, [setCode, includeBots, includeHumans, startDate, endDate, user?.id])

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
  const cellProps = { showYou, showAll, showTop, showTournament, isBlurred }

  const CardSortHeader = ({ label, col, title }: { label: string, col: DeckSortKey, title?: string }) => (
    <th className={`sortable ${cardSortKey === col ? 'active' : ''}`} onClick={() => handleCardSort(col)} title={title}>
      {label}{cardSortKey === col && <span className="sort-indicator">{cardSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )
  const LeaderSelSortHeader = ({ label, col, title }: { label: string, col: LeaderSelSortKey, title?: string }) => (
    <th className={`sortable ${leaderSelSortKey === col ? 'active' : ''}`} onClick={() => handleLeaderSelSort(col)} title={title}>
      {label}{leaderSelSortKey === col && <span className="sort-indicator">{leaderSelSortAsc ? ' ▲' : ' ▼'}</span>}
    </th>
  )

  return (
    <div className="cards-subtab">
      {/* Leader Selection */}
      {hasLeaderSel && (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Leaders</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            How often each leader is chosen for sealed decks ({fmt(leaderSelData.totalDecks)} decks)
          </p>
          <StatsLegend {...legendProps} showBuiltDeckFilter={false} />
          <div className="stats-table-container" style={{ marginBottom: '2rem' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <LeaderSelSortHeader label="Leader" col="cardName" />
                  <th>Aspects</th>
                  <LeaderSelSortHeader label="Selection %" col="selectionRate" title="Percentage of sealed decks that chose this leader" />
                  <LeaderSelSortHeader label="# Selected" col="timesSelected" />
                </tr>
              </thead>
              <tbody>
                {sortedLeaderSel.map(leader => {
                  const tournamentLeader = leaderSelTournamentMap.get(leader.cardName)
                  const topLeader = leaderSelTopMap.get(leader.cardName)
                  const youLeader = leaderSelYouMap.get(leader.cardName)
                  return (
                    <tr key={leader.cardId}>
                      <td
                        className="card-name-cell"
                        onMouseEnter={(e) => handleCardMouseEnter({ imageUrl: leader.imageUrl || undefined, name: leader.cardName, rarity: 'Legendary', isLeader: true }, e)}
                        onMouseLeave={handleCardMouseLeave}
                        onTouchStart={() => handleCardTouchStart({ imageUrl: leader.imageUrl || undefined, name: leader.cardName, rarity: 'Legendary', isLeader: true })}
                        onTouchEnd={handleCardTouchEnd}
                      >
                        <span className="card-name">{leader.cardName}</span>
                        {leader.subtitle && <span className="card-subtitle">{leader.subtitle}</span>}
                      </td>
                      <AspectsCell aspects={leader.aspects} />
                      <StatsCell
                        {...cellProps}
                        you={youLeader?.selectionRate}
                        all={leader.selectionRate}
                        top={topLeader?.selectionRate}
                        tournament={tournamentLeader?.selectionRate}
                        format={(v: number) => `${v.toFixed(1)}%`}
                      />
                      <StatsCell
                        {...cellProps}
                        you={youLeader?.timesSelected}
                        all={leader.timesSelected}
                        top={topLeader?.timesSelected}
                        tournament={tournamentLeader?.timesSelected}
                        format={fmt}
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
              <span className="stat-label">Pools with Decks:</span>
              <span className="stat-value">{fmt(cardData.totalPoolsWithDecks)}</span>
            </div>
          </div>

          {cardData.totalPoolsWithDecks < 20 && (
            <p className="stats-warning">
              Small sample size ({fmt(cardData.totalPoolsWithDecks)} pools with built decks). Statistics may not be reliable yet.
            </p>
          )}

          <StatsLegend {...legendProps} showBuiltDeckFilter={false} />
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <CardSortHeader label="Name" col="cardName" />
                  <th>Aspects</th>
                  <CardSortHeader label="Rarity" col="rarity" />
                  <CardSortHeader label="Inclusion %" col="inclusionRate" title="When this card is in your pool, how often does it make your deck?" />
                  <CardSortHeader label="Avg Copies" col="avgCopiesPlayed" title="When you include this card, how many copies do you run?" />
                  <CardSortHeader label="Pools" col="poolsWithCard" title="Number of sealed pools that contained this card" />
                </tr>
              </thead>
              <tbody>
                {sortedCards.map(card => {
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
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.avgCopiesPlayed}
                        all={card.avgCopiesPlayed}
                        top={topCard?.avgCopiesPlayed}
                        tournament={tournamentCard?.avgCopiesPlayed}
                        format={(v: number) => v.toFixed(1)}
                      />
                      <StatsCell
                        {...cellProps}
                        you={youCard?.poolsWithCard}
                        all={card.poolsWithCard}
                        top={topCard?.poolsWithCard}
                        tournament={tournamentCard?.poolsWithCard}
                        format={fmt}
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
