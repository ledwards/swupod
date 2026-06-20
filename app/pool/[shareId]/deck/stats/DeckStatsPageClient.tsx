'use client'

import { useEffect, useState } from 'react'
import Button from '@/src/components/Button'
import { useStickyTab } from '@/src/hooks/useStickyTab'
import { ReplayExplorer } from '@/src/components/YourStats/GameplayDashboard'
import PluginCTA, { usePluginCTA } from '@/src/components/PluginCTA'
import { AspectBreakdown, DuplicateRateWidget, LuckHistogram } from '@/src/components/YourStats/LuckHistogram'
import {
  buildDeckGameplayMetrics,
  buildOpponentBreakdown,
  MIN_DISTRIBUTION_MATCHES,
  MIN_MATCHUP_MATCHES,
} from '@/src/services/deckGameplayStats'
import { formatRecord } from '@/src/utils/deckRecord'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import '@/src/components/YourStats/YourStats.css'
import './deck-stats.css'

type DeckStatsTab = 'gamelog' | 'pool' | 'gameplay' | 'matchups'

const TABS: Array<{ value: DeckStatsTab; label: string }> = [
  { value: 'gamelog', label: 'Game Log' },
  { value: 'gameplay', label: 'Performance' },
  { value: 'matchups', label: 'Matchups' },
  { value: 'pool', label: 'Pool' },
]

function CardSilhouette() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" opacity="0.55" />
    </svg>
  )
}

function PlayMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function DraftLogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function ArtSlot({ src, tint }: { src: string | null; tint?: string | null }) {
  return (
    <div className="deck-stats-art-slot" style={{ ['--deck-art-tint' as any]: tint || '#1a2233' }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <CardSilhouette />}
    </div>
  )
}

function DeckStatsSideLabels({
  left,
  right,
}: {
  left: { leaderName: string; baseName: string }
  right: { leaderName: string; baseName: string }
}) {
  return (
    <div className="deck-stats-card-side-labels" aria-hidden="true">
      <span className="deck-stats-card-side-label deck-stats-card-side-label--left">
        <strong>{left.leaderName}</strong>
        <small>{left.baseName}</small>
      </span>
      <span className="deck-stats-card-side-label deck-stats-card-side-label--right">
        <strong>{right.leaderName}</strong>
        <small>{right.baseName}</small>
      </span>
    </div>
  )
}

function SkeletonPanel() {
  return (
    <section className="deck-stats-panel" aria-busy="true">
      <span className="skeleton-line deck-stats-skeleton deck-stats-skeleton--title" />
      <span className="skeleton-line deck-stats-skeleton" />
      <span className="skeleton-line deck-stats-skeleton deck-stats-skeleton--short" />
    </section>
  )
}

function StatePanel({
  eyebrow,
  title,
  children,
  tone = 'empty',
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
  tone?: 'empty' | 'error'
}) {
  return (
    <section className={`deck-stats-panel deck-stats-panel--${tone}`}>
      <span className="your-stats-eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  )
}

function EmptyGameplayPrompt({ deck, kind }: { deck: any; kind: 'gameplay' | 'matchups' }) {
  const { hasPlugin } = usePluginCTA()

  // Has the Companion but no games for this deck yet → deck-specific play prompt.
  if (hasPlugin) {
    const href = `/pool/${deck.shareId}/deck/play`
    return (
      <section className="deck-stats-panel deck-stats-panel--empty">
        <span className="your-stats-eyebrow">{kind === 'gameplay' ? 'Performance' : 'Matchups'}</span>
        <h3>No games recorded yet</h3>
        <p>
          You have the Companion — play some games with {deck.name} to unlock this tab.
        </p>
        <a className="btn btn--primary btn--sm deck-stats-empty-play" href={href}>
          <PlayMark />
          <span>Play deck</span>
        </a>
      </section>
    )
  }

  // No Companion → the one universal CTA. It self-gates (install pitch for the
  // rollout, neutral "coming soon" otherwise). Centered to match the other empties.
  return (
    <div className="deck-stats-empty-cta">
      <PluginCTA />
    </div>
  )
}

function PoolTab({ state, deck }: { state: any; deck: any }) {
  if (state.loading) return <SkeletonPanel />
  if (state.error) {
    return (
      <StatePanel eyebrow="Opening luck" title="Couldn't load pool luck" tone="error">
        Try refreshing this page.
      </StatePanel>
    )
  }

  const data = state.data
  if (!data) {
    return (
      <StatePanel eyebrow="Opening luck" title="No pool data found">
        This deck has no luck data available yet.
      </StatePanel>
    )
  }

  const cardHits = data.cardHits || []
  return (
    <section className="your-stats-luck-section deck-stats-luck-section" aria-label="Deck pool luck">
      <div className="your-stats-luck-section-header">
        <h3 className="your-stats-section-heading">Pool</h3>
        <p className="your-stats-luck-intro">
          {data.scope === 'kept' ? 'Drafted cards' : 'Opened packs'} for {deck.name}.
        </p>
      </div>

      {data.packsCracked === 0 ? (
        <div className="your-stats-luck-body your-stats-luck-body--empty">
          <p>No tracked pack-generation rows were found for this pool.</p>
        </div>
      ) : (
        <div className="your-stats-luck-body" data-testid="deck-luck-panels">
          <LuckHistogram cardHits={cardHits} packsCracked={data.packsCracked} />
          <div className="your-stats-luck-widget-row">
            {data.duplicates && <DuplicateRateWidget data={data.duplicates} />}
          </div>
          <AspectBreakdown cardHits={cardHits} />
        </div>
      )}
    </section>
  )
}

function GameLogTab({ state, deck }: { state: any; deck: any }) {
  if (state.loading) return <SkeletonPanel />
  if (state.error) {
    return (
      <StatePanel eyebrow="Game history" title="Couldn't load the Game Log" tone="error">
        Try refreshing this page.
      </StatePanel>
    )
  }

  const replays = state.data?.replays || []
  if (replays.length === 0) {
    return (
      <StatePanel eyebrow="Game history" title="No recorded games yet">
        Play some games with {deck.name} to start filling this deck's log.
      </StatePanel>
    )
  }

  return (
    <section className="deck-stats-game-log">
      <ReplayExplorer
        replays={replays}
        myName={deck.ownerName || 'Deck owner'}
        cardMode="side-labels"
        eyebrow="Game log"
        heading="Games"
      />
    </section>
  )
}

function pct(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`
}

function KpiCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="your-stats-gameplay-kpi">
      <span className="your-stats-gameplay-kpi-label">{label}</span>
      <strong className="your-stats-gameplay-kpi-value">{value}</strong>
      {subtext && <span className="your-stats-gameplay-kpi-subtext">{subtext}</span>}
    </div>
  )
}

function OutcomeBars({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws
  const winPct = total > 0 ? (wins / total) * 100 : 0
  const drawPct = total > 0 ? (draws / total) * 100 : 0
  const lossPct = total > 0 ? (losses / total) * 100 : 0

  return (
    <>
      <div className="your-stats-outcome-bars" aria-label={`Outcome mix: ${wins} wins, ${losses} losses, ${draws} draws`}>
        <span className="your-stats-outcome-bar your-stats-outcome-bar--win" style={{ width: `${winPct}%` }} />
        <span className="your-stats-outcome-bar your-stats-outcome-bar--draw" style={{ width: `${drawPct}%` }} />
        <span className="your-stats-outcome-bar your-stats-outcome-bar--loss" style={{ width: `${lossPct}%` }} />
      </div>
      <div className="your-stats-outcome-legend">
        <span><i className="your-stats-outcome-dot your-stats-outcome-dot--win" />Wins</span>
        <span><i className="your-stats-outcome-dot your-stats-outcome-dot--draw" />Draws</span>
        <span><i className="your-stats-outcome-dot your-stats-outcome-dot--loss" />Losses</span>
      </div>
    </>
  )
}

const DISTRIBUTION_COLORS: Record<string, string> = {
  '2-0': '#4ade80',
  '2-1': '#86efac',
  '1-2': '#fca5a5',
  '0-2': '#f87171',
  draw: '#facc15',
}

function DistributionChart({ data }: { data: any[] }) {
  return (
    <div className="deck-stats-chart-wrap">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: -18 }}>
          <XAxis dataKey="key" tick={{ fill: 'rgba(255,255,255,0.68)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#fff' }}
            labelStyle={{ color: '#fff' }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((bucket) => <Cell key={bucket.key} fill={DISTRIBUTION_COLORS[bucket.key] || '#90caf9'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function GameplayTab({
  state,
  deck,
}: {
  state: any
  deck: any
}) {
  if (state.loading) return <SkeletonPanel />
  if (state.error) {
    return (
      <StatePanel eyebrow="Performance" title="Couldn't load performance stats" tone="error">
        Try refreshing this page.
      </StatePanel>
    )
  }

  const replays = state.data?.replays || []
  if (replays.length === 0) {
    return <EmptyGameplayPrompt deck={deck} kind="gameplay" />
  }

  const metrics = buildDeckGameplayMetrics(replays)
  const matchRecord = metrics.matchRecord.matches > 0 ? metrics.matchRecord : {
    wins: deck.record.wins,
    losses: deck.record.losses,
    draws: deck.record.draws,
    matches: deck.record.wins + deck.record.losses + deck.record.draws,
    winRate: deck.record.wins + deck.record.losses + deck.record.draws > 0
      ? Math.round((deck.record.wins / (deck.record.wins + deck.record.losses + deck.record.draws)) * 1000) / 10
      : 0,
  }

  return (
    <section className="deck-stats-gameplay">
      <div className="your-stats-gameplay-kpi-grid">
        <KpiCard label="Matches" value={matchRecord.matches.toLocaleString()} subtext="Recorded" />
        <KpiCard label="Match win rate" value={pct(matchRecord.winRate)} subtext={formatRecord(matchRecord)} />
        <KpiCard label="Game win rate" value={metrics.gameRecord.matches ? pct(metrics.gameRecord.winRate) : '—'} subtext={metrics.gameRecord.matches ? formatRecord(metrics.gameRecord) : 'No game splits'} />
        <KpiCard label="Chart min" value={`${MIN_DISTRIBUTION_MATCHES}+`} subtext={metrics.canShowDistributionChart ? 'Chart on' : 'Record only'} />
      </div>

      <div className="your-stats-gameplay-card">
        <div className="your-stats-gameplay-card-header">
          <h3>Match Outcomes</h3>
          <span>{formatRecord(matchRecord)}</span>
        </div>
        <OutcomeBars wins={matchRecord.wins} losses={matchRecord.losses} draws={matchRecord.draws} />
      </div>

      <div className="your-stats-gameplay-card">
        <div className="your-stats-gameplay-card-header">
          <h3>Result Distribution</h3>
          <span>{metrics.canShowDistributionChart ? `${metrics.distributionMatches} matches` : `Needs ${MIN_DISTRIBUTION_MATCHES} matches`}</span>
        </div>
        {metrics.canShowDistributionChart ? (
          <DistributionChart data={metrics.distribution} />
        ) : (
          <p className="deck-stats-muted-copy">
            Charts unlock at {MIN_DISTRIBUTION_MATCHES} matches. Current record: {formatRecord(matchRecord)}.
          </p>
        )}
      </div>

      <p className="deck-stats-muted-copy">
        Not yet tracked: play/draw, game length, health, resources, or card-level win rates.
      </p>
    </section>
  )
}

function MatchupListItem({ item, deck }: { item: any; deck: any }) {
  const style = deck.baseColor ? ({ ['--right-row-tint' as any]: deck.baseColor }) : undefined
  const myLeaderArt = deck.leaderListImageUrl || deck.leaderImageUrl
  const leftLabel = {
    leaderName: item.leaderName || item.opponentName || 'Unknown leader',
    baseName: item.baseName || 'Unknown base',
  }
  const rightLabel = {
    leaderName: deck.leaderName || 'Your leader',
    baseName: deck.baseName || 'Unknown base',
  }

  return (
    <article className="your-stats-pool-build deck-stats-matchup-card" style={style}>
      <div className="your-stats-pool-build-art your-stats-replay-art-pair" aria-hidden="true">
        {item.leaderImageUrl ? (
          <img className="your-stats-replay-side-art your-stats-replay-side-art--opp" src={item.leaderImageUrl} alt="" loading="lazy" />
        ) : (
          <span className="your-stats-pool-build-art-fallback your-stats-pool-build-art-fallback--opp"><CardSilhouette /></span>
        )}
        {myLeaderArt ? (
          <img className="your-stats-replay-side-art your-stats-replay-side-art--mine" src={myLeaderArt} alt="" loading="lazy" />
        ) : (
          <span className="your-stats-pool-build-art-fallback"><CardSilhouette /></span>
        )}
      </div>

      <div className="deck-stats-matchup-card-content">
        <div className="deck-stats-matchup-card-record">
          <strong>{formatRecord(item)}</strong>
          {item.sufficientData ? (
            <span>{pct(item.winRate)}</span>
          ) : (
            <span>Insufficient data (&lt;{MIN_MATCHUP_MATCHES})</span>
          )}
        </div>
      </div>
      <DeckStatsSideLabels left={leftLabel} right={rightLabel} />
    </article>
  )
}

function MatchupsTab({
  state,
  deck,
}: {
  state: any
  deck: any
}) {
  if (state.loading) return <SkeletonPanel />
  if (state.error) {
    return (
      <StatePanel eyebrow="Matchups" title="Couldn't load matchup stats" tone="error">
        Try refreshing this page.
      </StatePanel>
    )
  }

  const matchups = buildOpponentBreakdown(state.data?.replays || [])
  if (matchups.length === 0) {
    return <EmptyGameplayPrompt deck={deck} kind="matchups" />
  }

  return (
    <section className="deck-stats-matchups">
      <div className="your-stats-replay-header">
        <div>
          <span className="your-stats-eyebrow">Opponent spread</span>
          <h3>Matchups</h3>
        </div>
        <span className="your-stats-count-pill">{matchups.length} {matchups.length === 1 ? 'matchup' : 'matchups'}</span>
      </div>
      <div className="deck-stats-matchup-list">
        {matchups.map((item) => (
          <MatchupListItem key={item.key} item={item} deck={deck} />
        ))}
      </div>
    </section>
  )
}

export default function DeckStatsPageClient({ deck }: { deck: any }) {
  const [activeTab, setActiveTab] = useStickyTab<DeckStatsTab>(
    ['gamelog', 'gameplay', 'matchups', 'pool'],
    'pool',
    { legacyParam: 'tab', storageKey: 'ptp:deck-stats-tab' },
  )
  const [gameplayState, setGameplayState] = useState<{ loading: boolean; error: boolean; data: any | null }>({
    loading: true,
    error: false,
    data: null,
  })
  const [luckState, setLuckState] = useState<{ loading: boolean; error: boolean; data: any | null }>({
    loading: true,
    error: false,
    data: null,
  })

  useEffect(() => {
    let cancelled = false
    setGameplayState((prev) => ({ ...prev, loading: true, error: false }))
    fetch(`/api/stats/deck/${deck.shareId}/gameplay`)
      .then((res) => {
        if (!res.ok) throw new Error(`deck gameplay fetch failed: ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (cancelled) return
        setGameplayState({ loading: false, error: false, data: body?.data || body })
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Deck gameplay fetch error:', error)
        setGameplayState({ loading: false, error: true, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [deck.shareId])

  useEffect(() => {
    let cancelled = false
    setLuckState((prev) => ({ ...prev, loading: true, error: false }))
    fetch(`/api/stats/deck/${deck.shareId}/luck`)
      .then((res) => {
        if (!res.ok) throw new Error(`deck luck fetch failed: ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (cancelled) return
        setLuckState({ loading: false, error: false, data: body?.data || body })
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Deck luck fetch error:', error)
        setLuckState({ loading: false, error: true, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [deck.shareId])

  const totalRecordGames = Number(deck.record?.wins || 0) + Number(deck.record?.losses || 0) + Number(deck.record?.draws || 0)
  const recordPercent = totalRecordGames > 0 ? pct((Number(deck.record?.wins || 0) / totalRecordGames) * 100) : null
  const recordLabel = String(deck.record?.label || 'No games')
  const recordDisplay = recordPercent && !recordLabel.includes('%') ? `${recordLabel} (${recordPercent})` : recordLabel

  return (
    <main className="deck-stats-page">
      <div className="deck-stats-inner">
        <div className="deck-stats-topbar">
          <Button variant="back" size="sm" onClick={() => { window.location.href = `/pool/${deck.shareId}/deck` }}>
            Back to Deck
          </Button>
        </div>

        <header className="deck-stats-hero">
          <div className="deck-stats-identity">
            <div className="deck-stats-art-pair" aria-hidden="true">
              <ArtSlot src={deck.leaderImageUrl} tint={deck.baseColor} />
              <ArtSlot src={deck.baseImageUrl} tint={deck.baseColor} />
            </div>
            <div className="deck-stats-titles">
              <span className="me-hero-eyebrow">{deck.setCode} · {deck.poolTypeLabel}</span>
              <h1>{deck.archetypeName || deck.name}</h1>
              <p>{deck.name}{deck.ownerName ? ` · ${deck.ownerName}` : ''}{deck.deckCardCount ? ` · ${deck.deckCardCount} cards` : ''}</p>
            </div>
          </div>
          <div className="deck-stats-record-cluster">
            {deck.draftLogUrl && (
              <a className="deck-stats-draft-log-icon" href={deck.draftLogUrl} title="Draft Log" aria-label="Open Draft Log">
                <DraftLogIcon />
              </a>
            )}
            <div className="deck-stats-record" aria-label={`Deck record: ${recordDisplay}`}>
              <span>Record</span>
              <strong>{recordDisplay}</strong>
            </div>
          </div>
        </header>

        <div className="your-stats deck-stats-tabs-shell" data-testid="deck-stats">
          <div className="deck-stats-tab-row">
            <div className="your-stats-tabs" role="tablist" aria-label="Deck stats sections">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`your-stats-tab ${activeTab === tab.value ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.value)}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  aria-controls={`deck-stats-${tab.value}-panel`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="your-stats-content deck-stats-content">
            <div id={`deck-stats-${activeTab}-panel`} role="tabpanel">
              {activeTab === 'gamelog'
                ? <GameLogTab state={gameplayState} deck={deck} />
                : activeTab === 'pool'
                  ? <PoolTab state={luckState} deck={deck} />
                  : activeTab === 'gameplay'
                  ? <GameplayTab state={gameplayState} deck={deck} />
                  : activeTab === 'matchups'
                      ? <MatchupsTab state={gameplayState} deck={deck} />
                      : null}
            </div>
            <div className="deck-stats-state-samples" aria-hidden="true">
              <SkeletonPanel />
              <StatePanel eyebrow="Error" title="Couldn't load this tab" tone="error">
                Try refreshing this page.
              </StatePanel>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
