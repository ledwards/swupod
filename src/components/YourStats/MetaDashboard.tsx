/**
 * MetaDashboard — community limited-meta stats for the /me "Meta" tab.
 *
 * Mirrors the public /stats page (prevalence of drafted + deck-built leaders),
 * scoped to the era's set. Each metric shows the all-players number with the
 * logged-in-players number in parentheses (loggedInOnly segment).
 *
 * Anything that depends on captured gameplay (win rate) is blurred behind a
 * "get the Companion" CTA — you have to give data to get data.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/src/components/Button'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import { getStatsSetTabs, DEFAULT_STATS_SET_TAB } from '@/src/utils/statsSetTabs'
import { getAspectColor, ASPECT_COLORS } from '@/src/utils/aspectColors'
import { DraftAnalytics } from './DraftAnalytics'

interface BaseSplit { aspect: string; winRate: number; matches: number }
interface WinRateLeader {
  leaderName: string
  winRate: number
  matches: number
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseColor: string | null
  byBase: BaseSplit[]
}

const WR_ASPECT_ICON: Record<string, string> = {
  Vigilance: '/icons/vigilance.png',
  Command: '/icons/command.png',
  Aggression: '/icons/aggression.png',
  Cunning: '/icons/cunning.png',
}

export interface MetaDashboardProps {
  since: string
  until: string
  setCode?: string
  /** When true, the set comes from the page-level global Set filter, so this
   *  dashboard shows no set selector of its own (the filter isn't repeated). */
  lockSet?: boolean
  includeBetaSets?: boolean
  fetchImpl?: typeof fetch
}

interface MetaEntry {
  name: string
  value: number
  loggedIn: number | null
  aspects: string[]
  imageUrl: string | null
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(1)}%`
}

async function getJson(f: typeof fetch, url: string) {
  const res = await f(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  const body = await res.json()
  return body && body.data ? body.data : body
}

function MetricBars({ entries, max }: { entries: MetaEntry[]; max: number }) {
  if (entries.length === 0) {
    return <p className="your-stats-meta-empty">No data for this set yet.</p>
  }
  return (
    <div className="your-stats-meta-bars">
      {entries.map((e) => {
        const color = getAspectColor({ aspects: e.aspects } as never)
        const width = max > 0 ? Math.max(4, (e.value / max) * 100) : 0
        return (
          <div key={e.name} className="your-stats-meta-bar-row">
            <div className="your-stats-meta-bar-head">
              <span className="your-stats-meta-bar-name">{e.name}</span>
              <span className="your-stats-meta-bar-value" style={{ color }}>
                {pct(e.value)}
              </span>
            </div>
            <div className="your-stats-meta-bar-track">
              <span className="your-stats-meta-bar-fill" style={{ width: `${width}%`, background: color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetaSkeleton() {
  return (
    <div className="your-stats-meta-bars">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-line your-stats-meta-skeleton" />
      ))}
    </div>
  )
}

/** Single-list metric card (used for draft-only metrics that have no sealed side). */
function MetaSection({
  eyebrow,
  title,
  subtitle,
  entries,
  loading,
  tag,
}: {
  eyebrow: string
  title: string
  subtitle: string
  entries: MetaEntry[]
  loading: boolean
  tag?: string
}) {
  const max = useMemo(() => Math.max(0, ...entries.map((e) => e.value)), [entries])
  return (
    <section className="your-stats-meta-card">
      <header className="your-stats-meta-card-header">
        <div>
          <span className="your-stats-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        {tag && <span className="your-stats-meta-tag">{tag}</span>}
      </header>
      <p className="your-stats-meta-subtitle">{subtitle}</p>
      {loading ? <MetaSkeleton /> : <MetricBars entries={entries} max={max} />}
    </section>
  )
}

/** Metric card split into Sealed (left) and Draft (right) halves, scaled to a
 *  shared max so the two columns read comparably. */
function SplitMetricSection({
  eyebrow,
  title,
  subtitle,
  sealed,
  draft,
  loading,
}: {
  eyebrow: string
  title: string
  subtitle: string
  sealed: MetaEntry[]
  draft: MetaEntry[]
  loading: boolean
}) {
  const max = useMemo(
    () => Math.max(0, ...sealed.map((e) => e.value), ...draft.map((e) => e.value)),
    [sealed, draft],
  )
  return (
    <section className="your-stats-meta-card">
      <header className="your-stats-meta-card-header">
        <div>
          <span className="your-stats-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
      </header>
      <p className="your-stats-meta-subtitle">{subtitle}</p>
      {loading ? (
        <MetaSkeleton />
      ) : (
        <div className="your-stats-meta-split">
          <div className="your-stats-meta-split-col">
            <span className="your-stats-meta-split-label">Sealed</span>
            <MetricBars entries={sealed} max={max} />
          </div>
          <div className="your-stats-meta-split-col">
            <span className="your-stats-meta-split-label">Draft</span>
            <MetricBars entries={draft} max={max} />
          </div>
        </div>
      )}
    </section>
  )
}

export function MetaDashboard({ since, until, setCode = DEFAULT_STATS_SET_TAB, lockSet = false, includeBetaSets = false, fetchImpl }: MetaDashboardProps) {
  // When locked by the page filter, always FOLLOW that set (incl. an upcoming/
  // beta set like ASH) — never fall back to a different default. The internal
  // selector only renders when unlocked, so its tab list still hides beta sets.
  const setTabs = useMemo(() => getStatsSetTabs(includeBetaSets || lockSet), [includeBetaSets, lockSet])
  const [activeSet, setActiveSet] = useState<string>(
    lockSet ? setCode : (setTabs.includes(setCode) ? setCode : DEFAULT_STATS_SET_TAB),
  )
  // Full lists, sliced into most/least at render so "least" is the true tail.
  // Popularity (deck inclusion) is split sealed vs draft; "picked" (draft pick
  // rate) is draft-only by nature.
  const [state, setState] = useState({
    loading: true,
    error: false,
    leadersPopSealed: [] as MetaEntry[],
    leadersPopDraft: [] as MetaEntry[],
    leadersPicked: [] as MetaEntry[],
    archSealed: [] as MetaEntry[],
    archDraft: [] as MetaEntry[],
    cardsPopSealed: [] as MetaEntry[],
    cardsPopDraft: [] as MetaEntry[],
    cardsPicked: [] as MetaEntry[],
    // Cards played OFF the deck's leader+base aspects (a splash), by how often
    // they show up off-aspect across decks. Popularity ⇒ split sealed/draft.
    offAspectSealed: [] as MetaEntry[],
    offAspectDraft: [] as MetaEntry[],
  })
  // The viewer's REAL win rate by leader, from their captured games — shown
  // outright (no blur gate). Empty until they have recorded games.
  const [winRates, setWinRates] = useState<WinRateLeader[]>([])

  // Follow the page's set. When locked, follow unconditionally (incl. ASH);
  // when unlocked, only adopt sets that exist as tabs.
  useEffect(() => {
    if (lockSet) { setActiveSet(setCode); return }
    if (setTabs.includes(setCode)) setActiveSet(setCode)
  }, [setCode, setTabs, lockSet])

  useEffect(() => {
    let cancelled = false
    const f = fetchImpl || fetch
    const params = new URLSearchParams({ since, until })
    if (activeSet) params.set('setCode', activeSet)
    f(`/api/stats/me/gameplay?${params.toString()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return
        const data = body && body.data ? body.data : body
        setWinRates(Array.isArray(data?.leaderBreakdown) ? data.leaderBreakdown : [])
      })
      .catch(() => { if (!cancelled) setWinRates([]) })
    return () => { cancelled = true }
  }, [activeSet, since, until, fetchImpl])

  useEffect(() => {
    let cancelled = false
    const f = fetchImpl || fetch
    setState((p) => ({ ...p, loading: true, error: false }))

    const base = `setCode=${encodeURIComponent(activeSet)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`
    const leaderEntry = (l: any): MetaEntry => ({
      name: l.cardName, value: Number(l.selectionRate || 0), loggedIn: null,
      aspects: l.aspects || [], imageUrl: l.imageUrl || null,
    })
    const cardInclusionEntry = (c: any): MetaEntry => ({
      name: c.cardName, value: Number(c.inclusionRate || 0), loggedIn: null,
      aspects: c.aspects || [], imageUrl: c.imageUrl || null,
    })
    // Off-aspect "share": fraction of all decks that ran this card OFF its
    // leader+base aspects = inclusionRate × offAspectRate. Surfaces splashes.
    const offAspectEntries = (rows: any[]): MetaEntry[] => (rows || [])
      .map((c: any) => ({
        name: c.cardName,
        value: Math.round((Number(c.inclusionRate || 0) * Number(c.offAspectRate || 0) / 100) * 10) / 10,
        loggedIn: null,
        aspects: c.aspects || [],
        imageUrl: c.imageUrl || null,
      }))
      .filter((e) => e.value > 0)
    // "Picked" = how often taken first when seen, with a pick floor so a single
    // lucky first-pick can't top the chart at 100%.
    const MIN_PICKS = 8
    const pickedEntries = (rows: any[]): MetaEntry[] => (rows || [])
      .filter((c: any) => Number(c.timesPicked || 0) >= MIN_PICKS && c.firstPickPct != null)
      .map((c: any) => ({
        name: c.cardName, value: Number(c.firstPickPct || 0), loggedIn: null,
        aspects: c.aspects || [], imageUrl: c.imageUrl || null,
      }))

    Promise.all([
      getJson(f, `/api/stats/leader-selection?${base}&poolType=sealed`),
      getJson(f, `/api/stats/leader-selection?${base}&poolType=draft`),
      getJson(f, `/api/stats/draft-picks?${base}&type=leaders`),
      getJson(f, `/api/stats/deck-inclusion?${base}&poolType=sealed`),
      getJson(f, `/api/stats/deck-inclusion?${base}&poolType=draft`),
      getJson(f, `/api/stats/draft-picks?${base}`),
      getJson(f, `/api/stats/archetype-selection?${base}&poolType=sealed`),
      getJson(f, `/api/stats/archetype-selection?${base}&poolType=draft`),
    ])
      .then(([leadSealed, leadDraft, leadPicked, cardSealed, cardDraft, cardPicked, archSealed, archDraft]) => {
        if (cancelled) return
        const archEntry = (a: any): MetaEntry => ({
          name: a.cardName, value: Number(a.selectionRate || 0), loggedIn: null,
          aspects: a.aspects || [], imageUrl: a.imageUrl || null,
        })
        setState({
          loading: false,
          error: false,
          leadersPopSealed: (leadSealed.leaders || []).map(leaderEntry),
          leadersPopDraft: (leadDraft.leaders || []).map(leaderEntry),
          leadersPicked: pickedEntries(leadPicked.cards),
          archSealed: (archSealed.archetypes || []).map(archEntry),
          archDraft: (archDraft.archetypes || []).map(archEntry),
          cardsPopSealed: (cardSealed.cards || []).map(cardInclusionEntry),
          cardsPopDraft: (cardDraft.cards || []).map(cardInclusionEntry),
          cardsPicked: pickedEntries(cardPicked.cards),
          offAspectSealed: offAspectEntries(cardSealed.cards),
          offAspectDraft: offAspectEntries(cardDraft.cards),
        })
      })
      .catch((err) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('MetaDashboard fetch error:', err)
        setState((p) => ({ ...p, loading: false, error: true }))
      })
    return () => {
      cancelled = true
    }
  }, [activeSet, since, until, fetchImpl])

  return (
    <section className="your-stats-meta" data-testid="meta-dashboard">
      <div className="your-stats-meta-toolbar">
        <div>
          <span className="your-stats-eyebrow">Limited Meta</span>
          <h3>What the field is drafting &amp; playing</h3>
        </div>
        {!lockSet && (
          <div className="your-stats-luck-set-buttons" role="radiogroup" aria-label="Meta set">
            {setTabs.map((s) => (
              <Button
                key={s}
                variant="toggle"
                size="sm"
                glowColor="blue"
                active={activeSet === s}
                onClick={() => setActiveSet(s)}
                role="radio"
                aria-checked={activeSet === s}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
      </div>

      {state.error ? (
        <p className="your-stats-error-note" role="status">Couldn't load meta stats. Try refreshing.</p>
      ) : (
        <>
          <WinRateCard leaders={winRates} />

          <div className="your-stats-meta-subhead">
            <span className="your-stats-eyebrow">By leader</span>
            <h3>Leaders</h3>
          </div>
          <div className="your-stats-meta-grid">
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Most popular leaders"
              subtitle="Share of built decks that chose each leader."
              sealed={topOf(state.leadersPopSealed)}
              draft={topOf(state.leadersPopDraft)}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Drafting"
              tag="Draft"
              title="Most picked leaders"
              subtitle="How often each leader is taken first in the draft."
              entries={topOf(state.leadersPicked)}
              loading={state.loading}
            />
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Least popular leaders"
              subtitle="The leaders the field almost never builds."
              sealed={leastOf(state.leadersPopSealed)}
              draft={leastOf(state.leadersPopDraft)}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Drafting"
              tag="Draft"
              title="Least picked leaders"
              subtitle="The leaders most often passed in the draft."
              entries={leastOf(state.leadersPicked)}
              loading={state.loading}
            />
          </div>

          <div className="your-stats-meta-subhead">
            <span className="your-stats-eyebrow">By archetype</span>
            <h3>Archetypes</h3>
          </div>
          <div className="your-stats-meta-grid">
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Most popular archetypes"
              subtitle="Share of built decks on each leader + base archetype."
              sealed={topOf(state.archSealed)}
              draft={topOf(state.archDraft)}
              loading={state.loading}
            />
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Least popular archetypes"
              subtitle="The leader + base pairings the field almost never builds."
              sealed={leastOf(state.archSealed)}
              draft={leastOf(state.archDraft)}
              loading={state.loading}
            />
          </div>

          <div className="your-stats-meta-subhead">
            <span className="your-stats-eyebrow">By card</span>
            <h3>Individual cards</h3>
          </div>
          <div className="your-stats-meta-grid">
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Most popular cards"
              subtitle="Share of built decks that run each card."
              sealed={topOf(state.cardsPopSealed)}
              draft={topOf(state.cardsPopDraft)}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Drafting"
              tag="Draft"
              title="Most picked cards"
              subtitle="How often each card is taken first when seen."
              entries={topOf(state.cardsPicked)}
              loading={state.loading}
            />
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Least popular cards"
              subtitle="Cards that almost never make a deck."
              sealed={leastOf(state.cardsPopSealed)}
              draft={leastOf(state.cardsPopDraft)}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Drafting"
              tag="Draft"
              title="Least picked cards"
              subtitle="Cards most often left in the pack."
              entries={leastOf(state.cardsPicked)}
              loading={state.loading}
            />
          </div>

          <div className="your-stats-meta-subhead">
            <span className="your-stats-eyebrow">Off-aspect</span>
            <h3>Popular splashes</h3>
          </div>
          <div className="your-stats-meta-grid">
            <SplitMetricSection
              eyebrow="Deckbuilding"
              title="Most-splashed off-aspect cards"
              subtitle="Cards run outside their deck's leader+base aspects — share of decks that splash them."
              sealed={topOf(state.offAspectSealed)}
              draft={topOf(state.offAspectDraft)}
              loading={state.loading}
            />
          </div>

          <DraftAnalytics setCode={activeSet} since={since} until={until} />
        </>
      )}
    </section>
  )
}

/** Top of a most-X list: highest entries, descending. */
function topOf(entries: MetaEntry[]): MetaEntry[] {
  return [...entries]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 8)
}

/** Bottom of a most-X list: lowest non-zero entries, ascending. */
function leastOf(entries: MetaEntry[]): MetaEntry[] {
  return [...entries]
    .filter((e) => Number(e.value || 0) > 0)
    .sort((a, b) => Number(a.value || 0) - Number(b.value || 0))
    .slice(0, 8)
}

/** Real win rate by leader from the viewer's captured games — shown outright. */
/** Win % colored from red (low) → green (high) for the square overlay. */
function winRateColor(wr: number): string {
  const hue = Math.max(0, Math.min(120, (wr / 100) * 120)) // 0=red, 120=green
  return `hsl(${hue}, 70%, 45%)`
}

/** The 4 base-aspect win-rate bars shown under the grid for the active leader. */
function BaseBars({ leader }: { leader: WinRateLeader }) {
  return (
    <div className="your-stats-wr-readout">
      <div className="your-stats-wr-readout-head">
        <strong>{leader.leaderName}</strong>
        <span>{leader.winRate.toFixed(1)}% · {leader.matches}g overall</span>
      </div>
      {leader.byBase.length === 0 ? (
        <p className="your-stats-meta-empty">No base breakdown yet.</p>
      ) : (
        <div className="your-stats-wr-bars">
          {leader.byBase.map((b) => (
            <div key={b.aspect} className="your-stats-wr-bar-row">
              <span className="your-stats-wr-bar-label">
                {WR_ASPECT_ICON[b.aspect] && <img src={WR_ASPECT_ICON[b.aspect]} alt={b.aspect} width={15} height={15} />}
                {b.aspect}
              </span>
              <div className="your-stats-wr-bar-track">
                <span className="your-stats-wr-bar-fill" style={{ width: `${Math.max(2, Math.min(100, b.winRate))}%`, background: ASPECT_COLORS[b.aspect as keyof typeof ASPECT_COLORS] || '#888' }} />
              </div>
              <span className="your-stats-wr-bar-val">{b.winRate.toFixed(0)}% · {b.matches}g</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WinRateCard({ leaders }: { leaders: WinRateLeader[] }) {
  const { detected } = useWayfinderDetection()
  const ranked = useMemo(
    () => [...leaders].filter((l) => l.matches > 0).sort((a, b) => b.winRate - a.winRate).slice(0, 12),
    [leaders],
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const activeName = hovered || pinned
  const active = ranked.find((l) => l.leaderName === activeName) || null

  return (
    <section className="your-stats-meta-card">
      <header className="your-stats-meta-card-header">
        <div>
          <span className="your-stats-eyebrow">Win Rate</span>
          <h3>Your win rate by leader</h3>
        </div>
      </header>
      {ranked.length === 0 ? (
        <p className="your-stats-meta-empty">
          No captured games yet for this set.{' '}
          {detected ? 'Queue your pools on Karabast and win rates fill in here.'
            : 'Install the Wayfinder Companion and play your pool on Karabast to record games.'}
        </p>
      ) : (
        <>
          <p className="your-stats-meta-subtitle">Tap or hover a leader for win rate by base aspect.</p>
          <div className="your-stats-wr-grid" onMouseLeave={() => setHovered(null)}>
            {ranked.map((l) => {
              const art = l.leaderBackImageUrl || l.leaderImageUrl
              const isActive = activeName === l.leaderName
              return (
                <button
                  key={l.leaderName}
                  type="button"
                  className={`your-stats-wr-cell${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => setHovered(l.leaderName)}
                  onFocus={() => setHovered(l.leaderName)}
                  onClick={() => setPinned((cur) => (cur === l.leaderName ? null : l.leaderName))}
                  aria-label={`${l.leaderName}: ${l.winRate.toFixed(0)}% win rate over ${l.matches} games`}
                  title={`${l.leaderName} — ${l.winRate.toFixed(0)}% (${l.matches}g)`}
                >
                  {art
                    ? <img className="your-stats-wr-cell-art" src={art} alt="" loading="lazy" />
                    : <span className="your-stats-wr-cell-art your-stats-wr-cell-art--empty" />}
                  <span className="your-stats-wr-cell-overlay">
                    <span className="your-stats-wr-cell-pct" style={{ color: winRateColor(l.winRate) }}>{l.winRate.toFixed(0)}%</span>
                    <span className="your-stats-wr-cell-games">{l.matches}g</span>
                  </span>
                </button>
              )
            })}
          </div>
          {active && <BaseBars leader={active} />}
        </>
      )}
    </section>
  )
}

export default MetaDashboard
