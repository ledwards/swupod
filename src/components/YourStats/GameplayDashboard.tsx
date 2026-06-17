'use client'

import { useEffect, useMemo, useState } from 'react'
import WayfinderStoreButtons, { WayfinderCompanionLockup } from '@/src/components/WayfinderStoreButtons'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import { useAuth } from '@/src/contexts/AuthContext'

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="13" height="13">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function resultLetter(result: GameplayReplay['result']): string {
  if (result === 'win') return 'W'
  if (result === 'loss') return 'L'
  if (result === 'draw') return 'D'
  return '·'
}

interface GameplayBreakdown {
  key: string
  label: string
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
  pools: number
  capturedMatches: number
}

interface GameplayRecentPool {
  shareId: string
  name: string
  setCode: string
  format: string
  formatLabel: string
  leaderName: string | null
  baseName: string | null
  leaderImageUrl: string | null
  baseImageUrl: string | null
  deckCardCount: number
  wins: number
  losses: number
  draws: number
  matches: number
  capturedMatches: number
  updatedAt: string | null
}

interface GameplayReplay {
  id: string
  wayfinderMatchId: string | null
  replayUrl: string
  playedAt: string | null
  result: 'win' | 'loss' | 'draw' | 'pending'
  gameResults: Array<'W' | 'L' | 'D'>
  opponent: {
    username: string | null
    avatarUrl: string | null
    leaderName: string | null
    leaderImageUrl: string | null
    baseName: string | null
    archetype: string | null
  }
  pool: {
    shareId: string | null
    name: string
    setCode: string
    format: string
    formatLabel: string
  }
  leaderName: string | null
  baseName: string | null
  leaderImageUrl: string | null
  baseImageUrl: string | null
  baseColor: string | null
  archetype: string | null
  deckCardCount: number
}

interface GameplayLeaderBreakdown {
  leaderName: string
  leaderImageUrl: string | null
  baseColor: string | null
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
  pools: number
}

interface GameplayPayload {
  summary: GameplayBreakdown & {
    decksPlayed: number
    replaysRecorded: number
  }
  formatBreakdown: GameplayBreakdown[]
  setBreakdown: GameplayBreakdown[]
  leaderBreakdown?: GameplayLeaderBreakdown[]
  recentPools: GameplayRecentPool[]
  replays?: GameplayReplay[]
}

interface FetchState {
  loading: boolean
  error: boolean
  data: GameplayPayload | null
}

export interface GameplayDashboardProps {
  since: string
  until: string
  /** Global Set filter ('all' or a set code) — filters by the pool's set. */
  setCode?: string
  fetchImpl?: typeof fetch
}

function formatPct(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatInt(value: number): string {
  return Number(value || 0).toLocaleString()
}

function recordLine(record: Pick<GameplayBreakdown, 'wins' | 'losses' | 'draws'>): string {
  return `${formatInt(record.wins)}W ${formatInt(record.losses)}L ${formatInt(record.draws)}D`
}

function replayDate(value: string | null): string {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function resultLabel(result: GameplayReplay['result']): string {
  if (result === 'win') return 'Win'
  if (result === 'loss') return 'Loss'
  if (result === 'draw') return 'Draw'
  return 'Pending'
}

const RESULT_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'win', label: 'Wins' },
  { value: 'loss', label: 'Losses' },
  { value: 'draw', label: 'Draws' },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function KpiCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string
  subtext?: string
}) {
  return (
    <div className="your-stats-gameplay-kpi">
      <span className="your-stats-gameplay-kpi-label">{label}</span>
      <strong className="your-stats-gameplay-kpi-value">{value}</strong>
      {subtext && <span className="your-stats-gameplay-kpi-subtext">{subtext}</span>}
    </div>
  )
}

function OutcomeBars({ wins, losses, draws }: Pick<GameplayBreakdown, 'wins' | 'losses' | 'draws'>) {
  const total = wins + losses + draws
  const winPct = total > 0 ? (wins / total) * 100 : 0
  const drawPct = total > 0 ? (draws / total) * 100 : 0
  const lossPct = total > 0 ? (losses / total) * 100 : 0

  return (
    <div className="your-stats-outcome-bars" aria-label={`Outcome mix: ${wins} wins, ${losses} losses, ${draws} draws`}>
      <span className="your-stats-outcome-bar your-stats-outcome-bar--win" style={{ width: `${winPct}%` }} />
      <span className="your-stats-outcome-bar your-stats-outcome-bar--draw" style={{ width: `${drawPct}%` }} />
      <span className="your-stats-outcome-bar your-stats-outcome-bar--loss" style={{ width: `${lossPct}%` }} />
    </div>
  )
}

function BreakdownRow({ item }: { item: GameplayBreakdown }) {
  // The bar IS the win rate — a true 0–100% fill so it reads as a percentage
  // and lines up with the % shown beside it (the 50% mark is hinted in CSS).
  const width = Math.max(0, Math.min(100, Number(item.winRate || 0)))

  return (
    <div className="your-stats-breakdown-row">
      <div className="your-stats-breakdown-label">
        <strong>{item.label}</strong>
        <span>{recordLine(item)}</span>
      </div>
      <div className="your-stats-breakdown-track your-stats-breakdown-track--pct">
        <span className="your-stats-breakdown-fill" style={{ width: `${width}%` }} />
      </div>
      <div className="your-stats-breakdown-metric">
        <strong>{formatPct(item.winRate)}</strong>
        <span>{formatInt(item.matches)} matches</span>
      </div>
    </div>
  )
}

function LeadersCard({ leaders }: { leaders: GameplayLeaderBreakdown[] }) {
  // Pie of leader USAGE (share of games) on the left, win rate per leader on the
  // right — inspired by the Wayfinder meta page.
  const total = leaders.reduce((s, l) => s + (l.matches || 0), 0)
  let acc = 0
  const stops = leaders
    .filter((l) => l.matches > 0)
    .map((l) => {
      const color = l.baseColor || '#888'
      const start = (acc / (total || 1)) * 360
      acc += l.matches
      const end = (acc / (total || 1)) * 360
      return `${color} ${start}deg ${end}deg`
    })
    .join(', ')
  return (
    <div className="your-stats-gameplay-card">
      <div className="your-stats-gameplay-card-header">
        <h3>Your Leaders</h3>
        <span>{leaders.length} {leaders.length === 1 ? 'leader' : 'leaders'} played</span>
      </div>
      <div className="your-stats-leaders-pie-layout">
        <div
          className="your-stats-leaders-pie"
          style={{ background: total > 0 ? `conic-gradient(${stops})` : 'rgba(255,255,255,0.08)' }}
          aria-hidden="true"
        />
        <ul className="your-stats-leaders-legend">
          {leaders.map((l) => {
            const color = l.baseColor || '#888'
            const usePct = total > 0 ? Math.round((l.matches / total) * 100) : 0
            return (
              <li key={l.leaderName} className="your-stats-leaders-legend-row">
                <span className="your-stats-leaders-legend-art" aria-hidden="true">
                  {l.leaderImageUrl ? <img src={l.leaderImageUrl} alt="" loading="lazy" /> : <span className="your-stats-leaders-legend-dot" style={{ background: color }} />}
                </span>
                <span className="your-stats-leaders-legend-name">
                  <strong>{l.leaderName}</strong>
                  <small>{formatInt(l.matches)} {l.matches === 1 ? 'game' : 'games'} · {usePct}%</small>
                </span>
                <span className="your-stats-leaders-legend-winrate">{formatPct(l.winRate)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function CompanionCTA({ hasData }: { hasData: boolean }) {
  // Already running the Companion? Don't pitch the install (R8).
  const { detected } = useWayfinderDetection()
  if (detected) return null
  return (
    <div className={`your-stats-gameplay-cta ${hasData ? 'your-stats-gameplay-cta--compact' : ''}`}>
      <div>
        <WayfinderCompanionLockup className="your-stats-gameplay-cta-lockup" />
        <h3>{hasData ? 'Keep every match connected' : 'Start capturing gameplay stats'}</h3>
        <p>
          Install the Companion to queue on Karabast with your PTP pool, tie games
          back to this page, and record replays you can rewatch.
        </p>
      </div>
      <WayfinderStoreButtons orientation="inline" />
    </div>
  )
}

function ReplayGamePips({ results }: { results: Array<'W' | 'L' | 'D'> }) {
  // For a single game the result chip already shows W/L — don't repeat it.
  if (!results || results.length <= 1) return null
  return (
    <span className="your-stats-replay-pips" aria-label={`Games: ${results.join('-')}`}>
      {results.map((g, i) => (
        <span key={i} className={`your-stats-replay-pip your-stats-replay-pip--${g.toLowerCase()}`} title={g}>
          {g}
        </span>
      ))}
    </span>
  )
}

function CardPlaceholder() {
  // Neutral card silhouette for when no leader art is available — never a letter.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" opacity="0.55" />
    </svg>
  )
}


function ReplayRow({ replay, myName }: { replay: GameplayReplay; myName: string }) {
  const opp = replay.opponent.username || 'Opponent'
  const style = replay.baseColor ? ({ ['--row-tint' as any]: replay.baseColor }) : undefined

  // No expand — there's no extra info. The whole card opens the replay.
  return (
    <a
      className={`your-stats-replay-card your-stats-replay-row--${replay.result}`}
      style={style}
      href={replay.replayUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="your-stats-replay-flank your-stats-replay-flank--mine" aria-hidden="true">
        {replay.leaderImageUrl ? <img src={replay.leaderImageUrl} alt="" loading="lazy" /> : <CardPlaceholder />}
      </span>

      <div className="your-stats-replay-center">
        <div className="your-stats-replay-center-top">
          <span className={`your-stats-replay-chip your-stats-replay-chip--${replay.result}`} title={resultLabel(replay.result)}>
            {resultLetter(replay.result)}
          </span>
          <span className="your-stats-replay-names">
            <strong>{myName}</strong>
            <span className="your-stats-replay-vs">vs</span>
            <strong>{opp}</strong>
          </span>
        </div>
        <div className="your-stats-replay-center-sub">
          <span>{replay.pool.setCode} · {replayDate(replay.playedAt)}</span>
          <ReplayGamePips results={replay.gameResults} />
        </div>
        <span className="your-stats-watch-btn your-stats-replay-watch-inline">
          <PlayGlyph />Watch
        </span>
      </div>

      <span className="your-stats-replay-flank your-stats-replay-flank--opp" aria-hidden="true">
        {replay.opponent.leaderImageUrl ? <img src={replay.opponent.leaderImageUrl} alt="" loading="lazy" /> : <CardPlaceholder />}
      </span>
    </a>
  )
}

function ReplayExplorer({ replays, myName }: { replays: GameplayReplay[]; myName: string }) {
  const [search, setSearch] = useState('')
  const [format, setFormat] = useState('all')
  const [result, setResult] = useState('all')
  const [sortBy, setSortBy] = useState<'recent' | 'leader' | 'result' | 'set'>('recent')

  const formats = useMemo(() => {
    const values = new Map<string, string>()
    for (const replay of replays) values.set(replay.pool.format, replay.pool.formatLabel)
    return Array.from(values.entries())
  }, [replays])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return replays
      .filter((replay) => format === 'all' || replay.pool.format === format)
      .filter((replay) => result === 'all' || replay.result === result)
      .filter((replay) => {
        if (!needle) return true
        return [
          replay.leaderName,
          replay.baseName,
          replay.pool.name,
          replay.pool.setCode,
          replay.pool.formatLabel,
          replay.opponent.username,
          replay.wayfinderMatchId,
        ].some((value) => String(value || '').toLowerCase().includes(needle))
      })
      .sort((a, b) => {
        if (sortBy === 'leader') return String(a.leaderName || '').localeCompare(String(b.leaderName || ''))
        if (sortBy === 'result') return resultLabel(a.result).localeCompare(resultLabel(b.result))
        if (sortBy === 'set') return a.pool.setCode.localeCompare(b.pool.setCode)
        return new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime()
      })
  }, [format, replays, result, search, sortBy])

  return (
    <section className="your-stats-replay-explorer" aria-label="Replay explorer">
      <div className="your-stats-replay-header">
        <div>
          <span className="your-stats-eyebrow">Replay Explorer</span>
          <h3>Every game, by leader &amp; base</h3>
        </div>
        <span className="your-stats-count-pill">{filtered.length.toLocaleString()} of {replays.length.toLocaleString()}</span>
      </div>

      <div className="your-stats-explorer-toolbar">
        <label className="your-stats-search">
          <SearchIcon />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search leader, base, opponent, set…"
            aria-label="Search replays"
          />
        </label>
        <div className="your-stats-seg" role="group" aria-label="Filter by result">
          {RESULT_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`your-stats-seg-btn ${result === f.value ? 'active' : ''}`}
              onClick={() => setResult(f.value)}
              aria-pressed={result === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="your-stats-explorer-selects">
          <label className="your-stats-field">
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="all">All formats</option>
              {formats.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="your-stats-field">
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as any)}>
              <option value="recent">Most recent</option>
              <option value="leader">Leader</option>
              <option value="result">Result</option>
              <option value="set">Set</option>
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="your-stats-explorer-empty">No replays match these filters.</p>
      ) : (
        <div className="your-stats-replay-list">
          {filtered.map((replay) => (
            <ReplayRow key={replay.id} replay={replay} myName={myName} />
          ))}
        </div>
      )}
    </section>
  )
}

export function GameplayDashboard({ since, until, setCode, fetchImpl }: GameplayDashboardProps) {
  const { user } = useAuth() as { user: { username?: string | null } | null }
  const myName = user?.username || 'You'
  const [state, setState] = useState<FetchState>({ loading: true, error: false, data: null })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: false }))
    const params = new URLSearchParams({ since, until })
    if (setCode && setCode !== 'all') params.set('setCode', setCode)
    const f = fetchImpl || fetch
    f(`/api/stats/me/gameplay?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`gameplay fetch failed: ${r.status}`)
        return r.json()
      })
      .then((body) => {
        if (cancelled) return
        const data = body && body.data ? body.data : body
        setState({ loading: false, error: false, data })
      })
      .catch((err) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('GameplayDashboard fetch error:', err)
        setState({ loading: false, error: true, data: null })
      })

    return () => {
      cancelled = true
    }
  }, [since, until, setCode, fetchImpl])

  if (state.loading) {
    return (
      <section className="your-stats-gameplay" data-testid="gameplay-dashboard" aria-busy="true">
        <div className="your-stats-gameplay-kpi-grid">
          {['Matches', 'Win rate', 'Record', 'Wayfinder captures'].map((label) => (
            <div key={label} className="your-stats-gameplay-kpi your-stats-counter--skeleton">
              <span className="skeleton-line your-stats-gameplay-kpi-skeleton-label" />
              <span className="skeleton-line your-stats-gameplay-kpi-skeleton-value" />
            </div>
          ))}
        </div>
        <div className="your-stats-gameplay-card your-stats-counter--skeleton" style={{ minHeight: 240 }} />
      </section>
    )
  }

  if (state.error || !state.data) {
    return (
      <section className="your-stats-gameplay" data-testid="gameplay-dashboard">
        <CompanionCTA hasData={false} />
        <p className="your-stats-error-note" role="status">
          Couldn't load gameplay stats. Try refreshing.
        </p>
      </section>
    )
  }

  const { summary } = state.data
  const hasData = summary.matches > 0 || summary.capturedMatches > 0 || summary.decksPlayed > 0
  const replays = state.data.replays || []
  const leaders = state.data.leaderBreakdown || []

  if (!hasData) {
    return (
      <section className="your-stats-gameplay" data-testid="gameplay-dashboard">
        <CompanionCTA hasData={false} />
        <div className="your-stats-gameplay-empty" data-testid="gameplay-empty">
          <h3>No captured games yet</h3>
          <p>
            Play a PTP pool through the Companion and this tab will fill with
            your record, win rate, format splits, set performance, and replay-linked pools.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="your-stats-gameplay" data-testid="gameplay-dashboard">
      <CompanionCTA hasData={hasData} />

      {/* Performance first: KPIs, win rate, and format/set splits sit ABOVE the
          long per-game history list (R13). Replay-Linked Pools removed. */}
      <div className="your-stats-gameplay-kpi-grid">
        <KpiCard label="Matches" value={formatInt(summary.matches)} subtext={`${formatInt(summary.pools)} pools`} />
        <KpiCard label="Win rate" value={formatPct(summary.winRate)} subtext={recordLine(summary)} />
        <KpiCard label="Record" value={recordLine(summary)} subtext="wins · losses · draws" />
        <KpiCard label="Wayfinder captures" value={formatInt(summary.replaysRecorded)} subtext={`${formatInt(summary.decksPlayed)} decks reached play`} />
      </div>

      <div className="your-stats-gameplay-card">
        <div className="your-stats-gameplay-card-header">
          <h3>Win Rate</h3>
          <span>{recordLine(summary)}</span>
        </div>
        <OutcomeBars wins={summary.wins} losses={summary.losses} draws={summary.draws} />
        <div className="your-stats-outcome-legend">
          <span><i className="your-stats-outcome-dot your-stats-outcome-dot--win" />Wins</span>
          <span><i className="your-stats-outcome-dot your-stats-outcome-dot--draw" />Draws</span>
          <span><i className="your-stats-outcome-dot your-stats-outcome-dot--loss" />Losses</span>
        </div>
      </div>

      {leaders.length > 0 && <LeadersCard leaders={leaders} />}

      <div className="your-stats-gameplay-split-grid">
        <div className="your-stats-gameplay-card">
          <h3>Format Performance</h3>
          <div className="your-stats-breakdown-list">
            {state.data.formatBreakdown.map((item) => (
              <BreakdownRow key={item.key} item={item} />
            ))}
          </div>
        </div>

        <div className="your-stats-gameplay-card">
          <h3>Set Performance</h3>
          <div className="your-stats-breakdown-list">
            {state.data.setBreakdown.map((item) => (
              <BreakdownRow key={item.key} item={item} />
            ))}
          </div>
        </div>
      </div>

      {replays.length > 0 && <ReplayExplorer replays={replays} myName={myName} />}
    </section>
  )
}

export default GameplayDashboard
