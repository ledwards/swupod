'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CardPreviewProvider, CardName } from '@/src/components/CardNamePreview'
import Modal from '@/src/components/Modal'
import PluginCTA from '@/src/components/PluginCTA'
import { AspectIcon } from '@/src/components/AspectIcon'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import { computeCardGrades } from '@/src/services/cardDataMetrics'
import { AspectFilterButtons, AspectsCell, useTableFilter } from '@/src/components/stats/TableFilters'

const fmt = (n: number) => n.toLocaleString()

type CardDataSortKey = 'cardName' | 'grade' | 'rarity' | 'gpWr' | 'gpCount' | 'deckCount' | 'rawCopies'
type CardDataView = 'table' | 'tiers'
type CardMetricKey = 'gihWr' | 'ohWr' | 'gdWr' | 'gpWr'
type CardKindFilter = 'leaders' | 'deck-cards' | 'units' | 'non-units'

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
  collectorNumber?: string | null
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
  ohWins?: number | null
  ohWr: number | null
  gdCount: number | null
  gdWins?: number | null
  gdWr: number | null
  gihCount: number | null
  gihWins?: number | null
  gihWr: number | null
  gnsCount: number | null
  gnsWr: number | null
  iih: number | null
  playedRate: number | null
  resourcedWhenSeen: number | null
  playedWar: number | null
  sampleWarning: string | null
  displayGrade?: string | null
  displayMetricValue?: number | null
  displayMetricCount?: number | null
}

interface CardDataStats {
  setCode: string
  format: string
  source: string
  sourceDetail?: string
  totalDecks: number
  totalMatches: number
  onlineLinkedDecks: number
  replayMetricsStatus: string
  gradeBasis: string
  leaders?: CardDataCard[]
  bases?: CardDataCard[]
  cards: CardDataCard[]
}

export interface CardDataTierListProps {
  setCode: string
  startDate: string
  endDate: string
  includeBots?: boolean
  includeHumans?: boolean
  title?: string
  description?: string
  allowTable?: boolean
  className?: string
  defaultFormat?: 'all' | 'sealed' | 'draft'
  defaultView?: CardDataView
  viewParamName?: string | null
}

const RARITY_ORDER: Record<string, number> = { Legendary: 0, Rare: 1, Uncommon: 2, Common: 3 }
const GRADE_ORDER: Record<string, number> = {
  'A+': 12, A: 11, 'A-': 10,
  'B+': 9, B: 8, 'B-': 7,
  'C+': 6, C: 5, 'C-': 4,
  'D+': 3, D: 2, 'D-': 1,
  F: 0, U: -1,
}
const CARD_TIER_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'U']
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

function SkeletonBlock({ width, height = 14 }: { width?: string, height?: number }) {
  return <div className="skeleton-line" style={{ maxWidth: width, height: `${height}px` }} />
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

function hasWayfinderReplayMetrics(sourceDetail?: string) {
  return sourceDetail === 'wayfinder' || sourceDetail === 'local-wayfinder'
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

function winsFromPct(rate: number | null | undefined, count: number | null | undefined): number {
  if (rate == null || count == null) return 0
  return (rate * count) / 100
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

function CardDataModalStat({ label, value, detail }: { label: string; value: string; detail?: string | undefined }) {
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

function CardDataSearchAndFilter({ search, setSearch, activeAspects, toggleAspect, clearAll }: {
  search: string
  setSearch: (s: string) => void
  activeAspects: Set<string>
  toggleAspect: (a: string) => void
  clearAll?: () => void
}) {
  return (
    <>
      <div className="card-data-control card-data-control--search">
        <span className="card-data-control-label">Search</span>
        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="stats-search-input card-data-search-input"
        />
      </div>
      <div className="card-data-control card-data-control--filter">
        <div className="card-data-filter-heading">
          <span className="card-data-control-label">Filter</span>
          {clearAll ? (
            <button type="button" className="card-data-filter-clear" onClick={clearAll}>
              Clear
            </button>
          ) : null}
        </div>
        <AspectFilterButtons activeAspects={activeAspects} toggleAspect={toggleAspect} />
      </div>
    </>
  )
}

export default function CardDataTierList({
  setCode,
  startDate,
  endDate,
  includeBots = false,
  includeHumans = true,
  title = 'Cards',
  description = 'Filter the card stats view by format, metric, card name, and aspect.',
  allowTable = true,
  className = '',
  defaultFormat = 'draft',
  defaultView = 'tiers',
  viewParamName = 'view',
}: CardDataTierListProps) {
  const [cardData, setCardData] = useState<CardDataStats | null>(null)
  const [format, setFormat] = useState<'all' | 'sealed' | 'draft'>(defaultFormat)
  const [loading, setLoading] = useState(true)
  const hasLoadedOnce = useRef(false)
  const [view, setView] = useState<CardDataView>(defaultView)
  const [selectedMetric, setSelectedMetric] = useState<CardMetricKey>('gpWr')
  const [selectedCard, setSelectedCard] = useState<CardDataCard | null>(null)
  const [cardKindFilter, setCardKindFilter] = useState<CardKindFilter>('deck-cards')
  const [sortKey, setSortKey] = useState<CardDataSortKey>('grade')
  const [sortAsc, setSortAsc] = useState(false)
  const [hasRecordedGame, setHasRecordedGame] = useState(false)
  const [presenceLoading, setPresenceLoading] = useState(true)
  const { detected: wayfinderDetected, settled: wayfinderSettled, pluginLoggedIn } = useWayfinderDetection()
  const cardFilter = useTableFilter()
  const source = 'online'
  const activeView = allowTable ? view : 'tiers'

  useEffect(() => {
    if (!allowTable || !viewParamName) return
    const requestedView = getUrlSearchParam(viewParamName)
    if (requestedView === 'table' || requestedView === 'tiers') {
      setView(requestedView)
    }
  }, [allowTable, viewParamName])

  const setCardDataView = (next: CardDataView) => {
    setView(next)
    if (viewParamName) replaceUrlSearchParam(viewParamName, next === 'tiers' ? null : next)
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

  const metricCount = (card: CardDataCard, metric: CardMetricKey) => {
    if (metric === 'ohWr') return card.ohCount
    if (metric === 'gdWr') return card.gdCount
    if (metric === 'gihWr') return card.gihCount
    return card.gpCount
  }

  const metricWins = (card: CardDataCard, metric: CardMetricKey) => {
    if (metric === 'ohWr') return card.ohWins ?? winsFromPct(card.ohWr, card.ohCount)
    if (metric === 'gdWr') return card.gdWins ?? winsFromPct(card.gdWr, card.gdCount)
    if (metric === 'gihWr') return card.gihWins ?? winsFromPct(card.gihWr, card.gihCount)
    return card.gpWins ?? winsFromPct(card.gpWr, card.gpCount)
  }

  const metricValue = (card: CardDataCard, metric: CardMetricKey) => {
    if (metric === 'ohWr') return card.ohWr
    if (metric === 'gdWr') return card.gdWr
    if (metric === 'gihWr') return card.gihWr
    return card.gpWr
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

  const rankRowsForMetric = (rows: CardDataCard[], metric: CardMetricKey) => {
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

  const availableCardRows = useMemo(() => [
    ...(cardData?.leaders || []),
    ...(cardData?.bases || []),
    ...(cardData?.cards || []),
  ], [cardData?.leaders, cardData?.bases, cardData?.cards])

  const scopedCardRows = useMemo(() => {
    const deckCards = cardData?.cards || []
    if (cardKindFilter === 'leaders') return cardData?.leaders || []
    if (cardKindFilter === 'units') return deckCards.filter(card => cardDataTileKind(card) === 'unit')
    if (cardKindFilter === 'non-units') return deckCards.filter(card => cardDataTileKind(card) !== 'unit')
    return deckCards
  }, [cardData?.leaders, cardData?.cards, cardKindFilter])

  const rankedCardRows = useMemo(() => {
    const filtered = scopedCardRows.filter(cardFilter.filterFn)
    const ranked = rankRowsForMetric(filtered, selectedMetric)
    const rows = sortRows(ranked.rows)
    return {
      ...ranked,
      rows,
      tierGroups: makeTierGroups(rows),
    }
  }, [
    scopedCardRows,
    cardData?.leaders,
    cardData?.cards,
    sortKey,
    sortAsc,
    selectedMetric,
    cardData?.sourceDetail,
    cardFilter.search,
    cardFilter.activeAspects,
  ])

  const hasCards = availableCardRows.length > 0
  const formatPct = (v: number) => `${v.toFixed(1)}%`
  const formatPctCompact = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return '—'
    return Number.isInteger(v) ? `${v.toFixed(0)}%` : `${v.toFixed(1)}%`
  }
  const cardNameEntry = (card: CardDataCard) => ({
    name: card.cardName,
    subtitle: card.subtitle,
    imageUrl: card.imageUrl,
    backImageUrl: card.backImageUrl || null,
    isLeader: Boolean(card.isLeader),
    isBase: Boolean(card.isBase),
  })
  const activeMetricLabel = cardDataMetricLabel(selectedMetric)
  const activeMetricFullLabel = cardDataMetricFullLabel(selectedMetric)
  const shownCount = rankedCardRows.rows.length
  const formatLabel = format === 'all' ? 'All' : format === 'sealed' ? 'Sealed' : 'Draft'
  const scopedCount = scopedCardRows.length
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
      <span className="card-data-metric-stack" title={`${cardDataMetricLabel(metric)} sample`}>
        <span>{formatPct(value)}</span>
        <small>{cardDataGamesLabel(count)}</small>
      </span>
    )
  }

  const tileStyle = (card: CardDataCard) => {
    const imageUrl = cardDataTileImageUrl(card)
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
              <td className="card-data-rarity-cell"><RarityIcon rarity={card.rarity} /></td>
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
                const imageUrl = cardDataTileImageUrl(card)
                return (
                  <button
                    type="button"
                    key={cardDataLookupKey(card)}
                    className={`card-data-tier-card card-data-tier-card-${cardDataTileKind(card)} ${imageUrl ? 'card-data-tier-card-has-art' : ''}`}
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
      <div className="card-data-tier-card-shell">
        <div className="card-data-section-header">
          <div>
            <h4>Cards Tier List</h4>
            <p>Grouped by {activeMetricFullLabel}</p>
          </div>
          <div className="card-data-tier-header-actions">
            <div className="card-data-card-kind-toggle" role="tablist" aria-label="Card type">
              {[
                ['leaders', 'Leaders'],
                ['deck-cards', 'All Deck Cards'],
                ['units', 'Units'],
                ['non-units', 'Non-Units'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`card-data-card-kind-button ${cardKindFilter === value ? 'active' : ''}`}
                  onClick={() => setCardKindFilter(value as CardKindFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>{fmt(shownCount)} / {fmt(scopedCount)} cards shown</span>
          </div>
        </div>
        {shownCount === 0 ? (
          <div className="stats-empty card-data-section-empty">No cards match these filters.</div>
        ) : activeView === 'tiers' ? (
          renderTierList()
        ) : (
          renderTable()
        )}
      </div>
    )
  }

  return (
    <CardPreviewProvider>
      <div className={`cards-subtab card-data-tab ${className}`.trim()}>
        <div className={`card-data-gated-shell ${cardsUnlocked ? '' : 'card-data-gated-shell--locked'}`.trim()}>
          <div className="card-data-gated-content" aria-hidden={!cardsUnlocked}>
            <div className="card-stats-mode-card card-data-control-panel">
              <div className="card-stats-mode-row">
                <div>
                  <div className="card-stats-mode-title">{title}</div>
                  <div className="card-data-muted">{description}</div>
                </div>
                {allowTable ? (
                  <div className="card-data-segmented card-stats-view-tabs" role="tablist" aria-label="Card stats view">
                    {[
                      ['tiers', 'Tier List'],
                      ['table', 'Table'],
                    ].map(([value, label]) => (
                      <button key={value} className={`card-data-segment ${activeView === value ? 'active' : ''}`} onClick={() => setCardDataView(value as CardDataView)}>{label}</button>
                    ))}
                  </div>
                ) : null}
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

                <CardDataSearchAndFilter {...cardFilter} />
              </div>

              <div className="card-stats-mode-row card-stats-mode-row--compact">
                <CardDataMetricDefinitions />
                <div className="card-data-muted">
                  {formatLabel} · {fmt(shownCount)} / {fmt(scopedCount)} cards loaded
                  {rankedCardRows.provisional ? ' · provisional grade thresholds' : ''}
                  {hasWayfinderReplayMetrics(cardData?.sourceDetail) ? ' · Wayfinder data' : ''}
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
