'use client'

import { useMemo } from 'react'
import { useStatsJson, statsUrl } from '@/src/hooks/useStatsJson'
import { WinRateByLeader, type WinRateLeader } from '@/src/components/YourStats/WinRateByLeader'
import { OverlayRow } from '@/src/components/DeckBuilder/DeckStats/StatsCharts'
import { buildLeaderScatter } from '@/src/services/meta/leaderScatter'
import { buildYouVsField } from '@/src/services/meta/pickCohorts'
import type { CurveComparison } from '@/src/services/meta/deckCurve'
import { LeaderScatter } from './LeaderScatter'
import { MatchupMatrix, type MatchupData } from './MatchupMatrix'
import { MetaArt, MetaEmpty, MetaPending, MetaSection, fmt, pct } from './MetaBits'

interface OverviewData {
  kpis: { recordedMatches: number; decksBuilt: number; decksWithResults: number }
  matchups: MatchupData
  curve: CurveComparison
}
interface Archetype { cardName: string; selectionRate: number; timesSelected: number; imageUrl: string | null; backImageUrl: string | null; hyperspaceBackImageUrl?: string | null }
type FieldLeader = WinRateLeader & { hyperspaceImageUrl?: string | null; hyperspaceBackImageUrl?: string | null }
interface Selection { cardName: string; selectionRate: number }

const ALL_TIME = { since: '2020-01-01', until: '2099-12-31' }
const SCATTER_MIN_MATCHES = 10

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mstats-kpi">
      <span className="mstats-kpi-label">{label}</span>
      <span className="mstats-kpi-value">{value}</span>
      {sub && <span className="mstats-kpi-sub">{sub}</span>}
    </div>
  )
}

export default function MetaOverview({ setCode, poolType, userId }: { setCode: string; poolType: 'draft' | 'sealed'; userId: string | null }) {
  const params = { setCode, poolType, ...ALL_TIME }
  const overview = useStatsJson<OverviewData>(statsUrl('/api/stats/meta-overview', params))
  const winRates = useStatsJson<{ leaderBreakdown: FieldLeader[] }>(statsUrl('/api/stats/leader-winrate', params))
  const selection = useStatsJson<{ leaders: Selection[] }>(statsUrl('/api/stats/leader-selection', params))
  const archetypes = useStatsJson<{ archetypes: Archetype[]; totalDecks: number }>(statsUrl('/api/stats/archetype-selection', params))
  const mine = useStatsJson<{ leaderBreakdown: WinRateLeader[] }>(userId ? statsUrl('/api/stats/me/gameplay', { setCode }) : null)

  // Hyperspace art everywhere a leader is drawn.
  const leaders = useMemo(() => (winRates.data?.leaderBreakdown || []).map((l) => ({
    ...l,
    leaderImageUrl: l.hyperspaceImageUrl || l.leaderImageUrl,
    leaderBackImageUrl: l.hyperspaceBackImageUrl || l.leaderBackImageUrl,
  })), [winRates.data])
  const scatter = useMemo(() => buildLeaderScatter(leaders, selection.data?.leaders || [], { minMatches: SCATTER_MIN_MATCHES }), [leaders, selection.data])
  const youRows = useMemo(() => buildYouVsField(mine.data?.leaderBreakdown || [], leaders), [mine.data, leaders])
  const topArchetypes = (archetypes.data?.archetypes || []).slice(0, 8)
  const archMax = Math.max(1, ...topArchetypes.map((a) => a.selectionRate))
  const curve = overview.data?.curve
  const curveMax = curve ? Math.max(1, ...curve.buckets.flatMap((b) => [b.all, b.winning])) : 1
  const kpis = overview.data?.kpis
  const leadersPlayed = leaders.filter((l) => l.matches > 0).length

  return (
    <div className="mstats-stack">
      {overview.loading && !kpis ? <MetaPending kind="control" count={4} /> : (
        <div className="mstats-kpis">
          <Kpi label="Recorded Matches" value={fmt(kpis?.recordedMatches)} sub="through Wayfinder and native play" />
          <Kpi label="Decks Built" value={fmt(kpis?.decksBuilt)} />
          <Kpi label="Decks With Results" value={fmt(kpis?.decksWithResults)} sub="a reported win or loss" />
          <Kpi label="Leaders Played" value={fmt(leadersPlayed)} sub={`of ${fmt(leaders.length)} in the set`} />
        </div>
      )}

      <div className="mstats-two">
        <div className="mstats-panel">
          {winRates.loading && !winRates.data ? <MetaPending kind="row" count={8} />
            : <WinRateByLeader leaders={leaders} title="Win Rate by Leader" mode="meta" showFullRoster />}
        </div>
        <MetaSection panel title="Popularity vs Win Rate" subtitle="Up and to the left is the edge: leaders that win but the field still passes on.">
          {(winRates.loading || selection.loading) && !scatter.points.length ? <MetaPending kind="card" count={1} /> : <LeaderScatter data={scatter} />}
        </MetaSection>
      </div>

      <div className="mstats-two mstats-two--even">
        <MetaSection panel title="Leader Matchups" subtitle="Win rate of the row leader against the column leader, from recorded matches.">
          {overview.loading && !overview.data ? <MetaPending kind="card" count={1} /> : overview.data ? <MatchupMatrix data={overview.data.matchups} /> : <MetaEmpty>Matchups are unavailable right now.</MetaEmpty>}
        </MetaSection>
        <MetaSection panel title="Most Built Archetypes" subtitle="Share of built decks on each leader and base pairing.">
          {archetypes.loading && !archetypes.data ? <MetaPending kind="row" count={8} /> : topArchetypes.length === 0 ? <MetaEmpty>No decks built for this set yet.</MetaEmpty> : (
            <ol className="mstats-bars">
              {topArchetypes.map((a) => (
                <li key={a.cardName} className="mstats-bar-row">
                  <MetaArt src={a.hyperspaceBackImageUrl || a.backImageUrl || a.imageUrl} alt="" size={34} />
                  <span className="mstats-bar-body">
                    <span className="mstats-bar-head"><span>{a.cardName}</span><span>{pct(a.selectionRate)}</span></span>
                    <span className="mstats-track" aria-hidden="true"><span className="mstats-track-fill mstats-track-fill--accent" style={{ width: `${(a.selectionRate / archMax) * 100}%` }} /></span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </MetaSection>
      </div>

      <div className="mstats-two mstats-two--even">
        <MetaSection panel title="What Winning Decks Look Like" subtitle="Average copies per deck at each cost, for decks that won more than they lost, over every built deck.">
          {!curve ? <MetaPending kind="row" count={8} /> : curve.winningDecks === 0 ? <MetaEmpty>No decks with a winning record yet.</MetaEmpty> : (
            <>
              <div className="mstats-legend">
                <span><i className="mstats-swatch mstats-swatch--top" />Winning decks ({fmt(curve.winningDecks)})</span>
                <span><i className="mstats-swatch mstats-swatch--all" />All decks ({fmt(curve.allDecks)})</span>
              </div>
              <div className="mstats-curve">
                {curve.buckets.map((b) => <OverlayRow key={b.label} label={`Cost ${b.label}`} primary={b.winning} pool={b.all} max={curveMax} fill="var(--theme-highlight)" />)}
              </div>
              <p className="mstats-note">Average cost {curve.winningAvgCost?.toFixed(1) ?? '–'} in winning decks, {curve.allAvgCost?.toFixed(1) ?? '–'} overall.</p>
            </>
          )}
        </MetaSection>
        <MetaSection panel title="You vs the Field" subtitle="Your record on each leader against everyone who played it.">
          {!userId ? <MetaEmpty>Sign in to compare your leaders with the field.</MetaEmpty>
            : mine.loading && !mine.data ? <MetaPending kind="row" count={3} />
            : youRows.length === 0 ? <MetaEmpty>Record at least 3 matches on a leader in this set to see it here.</MetaEmpty>
            : (
              <ul className="mstats-you">
                {youRows.map((r) => (
                  <li key={r.leaderName} className="mstats-you-row">
                    <MetaArt src={r.imageUrl} alt="" size={44} />
                    <span className="mstats-you-body">
                      <strong>{r.leaderName}</strong>
                      <span>You {pct(r.yourWinRate)} over {fmt(r.yourMatches)} · Field {pct(r.fieldWinRate)}</span>
                    </span>
                    <span className={`mstats-delta ${r.delta >= 0 ? 'mstats-up' : 'mstats-down'}`}>{r.delta >= 0 ? '+' : '−'}{Math.abs(r.delta).toFixed(1)} pts</span>
                  </li>
                ))}
              </ul>
            )}
          <a className="mstats-link" href="/me">Your full stats</a>
        </MetaSection>
      </div>
    </div>
  )
}
