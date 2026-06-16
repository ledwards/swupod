'use client'

import { useEffect, useMemo, useState } from 'react'
import WayfinderStoreButtons, { WayfinderCompanionLockup, WAYFINDER_NEWS_URL } from '@/src/components/WayfinderStoreButtons'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import UserAvatar from '@/src/components/UserAvatar'

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

function comboLine(replay: GameplayReplay): string {
  if (replay.leaderName && replay.baseName) return `${replay.leaderName} / ${replay.baseName}`
  if (replay.leaderName) return replay.leaderName
  if (replay.baseName) return replay.baseName
  return replay.pool.name
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

function BreakdownRow({ item, maxMatches }: { item: GameplayBreakdown; maxMatches: number }) {
  const width = maxMatches > 0 ? Math.max(8, (item.matches / maxMatches) * 100) : 0

  return (
    <div className="your-stats-breakdown-row">
      <div className="your-stats-breakdown-label">
        <strong>{item.label}</strong>
        <span>{recordLine(item)}</span>
      </div>
      <div className="your-stats-breakdown-track">
        <span className="your-stats-breakdown-fill" style={{ width: `${width}%` }} />
      </div>
      <div className="your-stats-breakdown-metric">
        <strong>{formatPct(item.winRate)}</strong>
        <span>{formatInt(item.matches)} matches</span>
      </div>
    </div>
  )
}

function LeaderRow({ leader, maxMatches }: { leader: GameplayLeaderBreakdown; maxMatches: number }) {
  const share = maxMatches > 0 ? Math.max(6, (leader.matches / maxMatches) * 100) : 0
  const tint = leader.baseColor || 'var(--ys-accent)'
  return (
    <div className="your-stats-leader-row">
      <span className="your-stats-leader-art" aria-hidden="true" style={{ ['--row-tint' as any]: tint }}>
        {leader.leaderImageUrl ? (
          <img src={leader.leaderImageUrl} alt="" loading="lazy" />
        ) : (
          <span className="your-stats-leader-art-fallback">{leader.leaderName.charAt(0)}</span>
        )}
      </span>
      <div className="your-stats-leader-body">
        <div className="your-stats-leader-toprow">
          <strong className="your-stats-leader-name">{leader.leaderName}</strong>
          <span className="your-stats-leader-winrate">{formatPct(leader.winRate)}</span>
        </div>
        <div className="your-stats-leader-track" style={{ ['--row-tint' as any]: tint }}>
          <span className="your-stats-leader-fill" style={{ width: `${share}%` }} />
        </div>
        <div className="your-stats-leader-meta">
          <span>{recordLine(leader)}</span>
          <span>{formatInt(leader.matches)} {leader.matches === 1 ? 'game' : 'games'} · {formatInt(leader.pools)} {leader.pools === 1 ? 'pool' : 'pools'}</span>
        </div>
      </div>
    </div>
  )
}

function LeadersCard({ leaders }: { leaders: GameplayLeaderBreakdown[] }) {
  const maxMatches = Math.max(0, ...leaders.map((l) => l.matches))
  return (
    <div className="your-stats-gameplay-card">
      <div className="your-stats-gameplay-card-header">
        <h3>Your Leaders</h3>
        <span>{leaders.length} {leaders.length === 1 ? 'leader' : 'leaders'} played</span>
      </div>
      <div className="your-stats-leader-list">
        {leaders.map((leader) => (
          <LeaderRow key={leader.leaderName} leader={leader} maxMatches={maxMatches} />
        ))}
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
  if (!results || results.length === 0) return null
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

function ReplayRow({ replay, expanded, onToggle }: { replay: GameplayReplay; expanded: boolean; onToggle: () => void }) {
  const leader = replay.leaderName || comboLine(replay)
  const opp = replay.opponent.username || 'Opponent'
  const style = replay.baseColor ? ({ ['--row-tint' as any]: replay.baseColor }) : undefined
  const fullMatchUrl = replay.wayfinderMatchId
    ? `${WAYFINDER_NEWS_URL}/matches/${replay.wayfinderMatchId}`
    : null

  return (
    <div className={`your-stats-replay-item${expanded ? ' is-expanded' : ''}`}>
      <div
        className={`your-stats-replay-row your-stats-replay-row--${replay.result}`}
        style={style}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
      >
        <span className={`your-stats-replay-chip your-stats-replay-chip--${replay.result}`} title={resultLabel(replay.result)}>
          {resultLetter(replay.result)}
        </span>

        <span className="your-stats-replay-art" aria-hidden="true">
          {replay.leaderImageUrl ? (
            <img src={replay.leaderImageUrl} alt="" loading="lazy" />
          ) : (
            <span className="your-stats-replay-art-fallback">{leader.charAt(0)}</span>
          )}
        </span>

        <div className="your-stats-replay-matchup">
          <span className="your-stats-replay-leader">{leader}</span>
          <span className="your-stats-replay-vs">vs</span>
          <span className="your-stats-replay-opp">
            <UserAvatar
              size={20}
              src={replay.opponent.avatarUrl}
              alt={opp}
              fallback={opp.charAt(0).toUpperCase()}
              placeholderClassName="your-stats-owner-avatar-placeholder"
            />
            <span className="your-stats-replay-opp-name">{opp}</span>
          </span>
        </div>

        <span className="your-stats-replay-when">{replay.pool.setCode} · {replayDate(replay.playedAt)}</span>
        <ReplayGamePips results={replay.gameResults} />
        <a
          className="your-stats-watch-btn"
          href={replay.replayUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <PlayGlyph />Watch
        </a>
        <span className={`your-stats-replay-caret${expanded ? ' is-open' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>

      {expanded && (
        <div className="your-stats-replay-detail">
          <div className="your-stats-replay-detail-grid">
            <div className="your-stats-replay-detail-field">
              <small>Result</small>
              <strong>{resultLabel(replay.result)}</strong>
            </div>
            {replay.gameResults.length > 0 && (
              <div className="your-stats-replay-detail-field">
                <small>Games</small>
                <span className="your-stats-replay-detail-games">
                  {replay.gameResults.map((g, i) => (
                    <span key={i} className={`your-stats-replay-pip your-stats-replay-pip--${g.toLowerCase()}`}>{g}</span>
                  ))}
                </span>
              </div>
            )}
            <div className="your-stats-replay-detail-field">
              <small>Deck</small>
              <strong>{leader}{replay.baseName ? ` / ${replay.baseName}` : ''}</strong>
            </div>
            <div className="your-stats-replay-detail-field">
              <small>Opponent</small>
              <strong>{opp}</strong>
            </div>
            <div className="your-stats-replay-detail-field">
              <small>Pool</small>
              <strong>{replay.pool.name}</strong>
            </div>
            <div className="your-stats-replay-detail-field">
              <small>Played</small>
              <strong>{replayDate(replay.playedAt)} · {replay.pool.setCode} {replay.pool.formatLabel}</strong>
            </div>
          </div>
          <div className="your-stats-replay-detail-actions">
            <a className="your-stats-watch-btn" href={replay.replayUrl} target="_blank" rel="noopener noreferrer">
              <PlayGlyph />Watch replay
            </a>
            {fullMatchUrl && (
              <a className="btn btn--secondary btn--sm your-stats-pool-action" href={fullMatchUrl} target="_blank" rel="noopener noreferrer">
                Full match on Wayfinder
              </a>
            )}
            {replay.pool.shareId && (
              <a className="btn btn--secondary btn--sm your-stats-pool-action" href={`/pool/${replay.pool.shareId}/deck/play`}>
                Open deck
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ReplayExplorer({ replays }: { replays: GameplayReplay[] }) {
  const [search, setSearch] = useState('')
  const [format, setFormat] = useState('all')
  const [result, setResult] = useState('all')
  const [sortBy, setSortBy] = useState<'recent' | 'leader' | 'result' | 'set'>('recent')
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
            <ReplayRow
              key={replay.id}
              replay={replay}
              expanded={expandedId === replay.id}
              onToggle={() => setExpandedId((cur) => (cur === replay.id ? null : replay.id))}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function GameplayDashboard({ since, until, fetchImpl }: GameplayDashboardProps) {
  const [state, setState] = useState<FetchState>({ loading: true, error: false, data: null })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: false }))
    const params = new URLSearchParams({ since, until })
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
  }, [since, until, fetchImpl])

  const maxFormatMatches = useMemo(
    () => Math.max(0, ...(state.data?.formatBreakdown || []).map((item) => item.matches)),
    [state.data?.formatBreakdown]
  )
  const maxSetMatches = useMemo(
    () => Math.max(0, ...(state.data?.setBreakdown || []).map((item) => item.matches)),
    [state.data?.setBreakdown]
  )

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
              <BreakdownRow key={item.key} item={item} maxMatches={maxFormatMatches} />
            ))}
          </div>
        </div>

        <div className="your-stats-gameplay-card">
          <h3>Set Performance</h3>
          <div className="your-stats-breakdown-list">
            {state.data.setBreakdown.map((item) => (
              <BreakdownRow key={item.key} item={item} maxMatches={maxSetMatches} />
            ))}
          </div>
        </div>
      </div>

      {replays.length > 0 && <ReplayExplorer replays={replays} />}

      <CompanionCTA hasData={hasData} />
    </section>
  )
}

export default GameplayDashboard
