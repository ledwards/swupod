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
import { getStatsSetTabs, getDefaultStatsSetTab, DEFAULT_STATS_SET_TAB } from '@/src/utils/statsSetTabs'
import { todayStr } from '@/src/utils/statsEras'
import { getAspectColor } from '@/src/utils/aspectColors'
import { DraftAnalytics } from './DraftAnalytics'
import { CardPreviewProvider, CardName } from './CardNamePreview'
import { WinRateByLeader, type WinRateLeader } from './WinRateByLeader'

// Meta = the whole site's pool for the set, all-time up to today — never the
// page's date range (which would slice the metagame to a sliver).
const META_SINCE = '2020-01-01'
const META_UNTIL = todayStr()

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
  subtitle?: string | null
  backImageUrl?: string | null
  isLeader?: boolean
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

function MetricBars({ entries }: { entries: MetaEntry[] }) {
  if (entries.length === 0) {
    return <p className="your-stats-meta-empty">No data for this set yet.</p>
  }
  return (
    <div className="your-stats-meta-bars">
      {entries.map((e) => {
        const color = getAspectColor({ aspects: e.aspects } as never)
        // Fill to the ACTUAL percentage — a 12% rate fills 12%, not relative to
        // the row's max (which made a 0.3% rate fill the whole bar).
        const width = Math.max(0, Math.min(100, Number(e.value) || 0))
        return (
          <div key={e.name} className="your-stats-meta-bar-row">
            <div className="your-stats-meta-bar-head">
              <CardName entry={e} className="your-stats-meta-bar-name" />
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
      {loading ? <MetaSkeleton /> : <MetricBars entries={entries} />}
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
  twoColumn = false,
}: {
  eyebrow: string
  title: string
  subtitle: string
  sealed: MetaEntry[]
  draft: MetaEntry[]
  loading: boolean
  /** Render each side (Sealed/Draft) as two stacked columns — lets a side fit
   *  ~20 rows in the same height. Bars use absolute %, so splitting is safe. */
  twoColumn?: boolean
}) {
  const renderSide = (entries: MetaEntry[]) => {
    if (!twoColumn || entries.length <= 1) return <MetricBars entries={entries} />
    const half = Math.ceil(entries.length / 2)
    const right = entries.slice(half)
    return (
      <div className="your-stats-meta-twocol">
        <MetricBars entries={entries.slice(0, half)} />
        {right.length > 0 && <MetricBars entries={right} />}
      </div>
    )
  }
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
            {renderSide(sealed)}
          </div>
          <div className="your-stats-meta-split-col">
            <span className="your-stats-meta-split-label">Draft</span>
            {renderSide(draft)}
          </div>
        </div>
      )}
    </section>
  )
}

export function MetaDashboard({ setCode = DEFAULT_STATS_SET_TAB, lockSet = false, includeBetaSets = false, fetchImpl }: MetaDashboardProps) {
  // When locked by the page filter, always FOLLOW that set (incl. an upcoming/
  // beta set like ASH) — never fall back to a different default. The internal
  // selector only renders when unlocked, so its tab list still hides beta sets.
  const setTabs = useMemo(() => getStatsSetTabs(includeBetaSets || lockSet), [includeBetaSets, lockSet])
  const [activeSet, setActiveSet] = useState<string>(
    lockSet ? setCode : (setTabs.includes(setCode) ? setCode : getDefaultStatsSetTab(includeBetaSets)),
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

  // Meta-wide win rate by leader (whole site, all-time). The PERSONAL version
  // lives on the Gameplay tab.
  useEffect(() => {
    let cancelled = false
    const f = fetchImpl || fetch
    const params = new URLSearchParams({ since: META_SINCE, until: META_UNTIL })
    if (activeSet) params.set('setCode', activeSet)
    f(`/api/stats/leader-winrate?${params.toString()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return
        const data = body && body.data ? body.data : body
        setWinRates(Array.isArray(data?.leaderBreakdown) ? data.leaderBreakdown : [])
      })
      .catch(() => { if (!cancelled) setWinRates([]) })
    return () => { cancelled = true }
  }, [activeSet, fetchImpl])

  useEffect(() => {
    let cancelled = false
    const f = fetchImpl || fetch
    setState((p) => ({ ...p, loading: true, error: false }))

    // Meta is the WHOLE-SITE metagame for the set — the entire pool, not the
    // page's date window (which slices it to almost nothing, e.g. LAW 24 decks
    // vs 3,080 all-time, and ASH 0). So the aggregate fetches are all-time; the
    // per-request edge cache (s-maxage=300 on each endpoint) carries the cost.
    const base = `setCode=${encodeURIComponent(activeSet)}&since=${encodeURIComponent(META_SINCE)}&until=${encodeURIComponent(META_UNTIL)}`
    const leaderEntry = (l: any): MetaEntry => ({
      name: l.cardName, value: Number(l.selectionRate || 0), loggedIn: null,
      aspects: l.aspects || [], imageUrl: l.imageUrl || null,
      subtitle: l.subtitle || null, backImageUrl: l.backImageUrl || null, isLeader: true,
    })
    const cardInclusionEntry = (c: any): MetaEntry => ({
      name: c.cardName, value: Number(c.inclusionRate || 0), loggedIn: null,
      aspects: c.aspects || [], imageUrl: c.imageUrl || null,
      subtitle: c.subtitle || null, backImageUrl: c.backImageUrl || null,
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
        subtitle: c.subtitle || null, backImageUrl: c.backImageUrl || null,
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
        subtitle: c.subtitle || null, backImageUrl: c.backImageUrl || null,
      }))

    Promise.all([
      getJson(f, `/api/stats/leader-selection?${base}&poolType=sealed&normalized=true`),
      getJson(f, `/api/stats/leader-selection?${base}&poolType=draft&normalized=true`),
      getJson(f, `/api/stats/draft-picks?${base}&type=leaders`),
      getJson(f, `/api/stats/deck-inclusion?${base}&poolType=sealed`),
      getJson(f, `/api/stats/deck-inclusion?${base}&poolType=draft`),
      getJson(f, `/api/stats/draft-picks?${base}`),
      getJson(f, `/api/stats/archetype-selection?${base}&poolType=sealed`),
      getJson(f, `/api/stats/archetype-selection?${base}&poolType=draft`),
    ])
      .then(([leadSealed, leadDraft, leadPicked, cardSealed, cardDraft, cardPicked, archSealed, archDraft]) => {
        if (cancelled) return
        // Archetype name isn't a single card — no subtitle; hover previews the leader.
        const archEntry = (a: any): MetaEntry => ({
          name: a.cardName, value: Number(a.selectionRate || 0), loggedIn: null,
          aspects: a.aspects || [], imageUrl: a.imageUrl || null,
          backImageUrl: a.backImageUrl || null, isLeader: true,
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
    // Meta is all-time (whole site) — only the set drives a refetch, not range.
  }, [activeSet, fetchImpl])

  return (
   <CardPreviewProvider>
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
          <WinRateByLeader leaders={winRates} title="Win rate by leader" mode="meta" />

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
          <SplitMetricSection
            eyebrow="Deckbuilding"
            title="Most-splashed off-aspect cards"
            subtitle="Cards run outside the deck's leader+base aspects — of the pools that had the card, how often it's splashed off-aspect (normalized for how often it shows up)."
            sealed={top20(state.offAspectSealed)}
            draft={top20(state.offAspectDraft)}
            loading={state.loading}
            twoColumn
          />

          <DraftAnalytics setCode={activeSet} since={META_SINCE} until={META_UNTIL} />
        </>
      )}
    </section>
   </CardPreviewProvider>
  )
}

/** Top of a most-X list: highest entries, descending. */
function topOf(entries: MetaEntry[]): MetaEntry[] {
  return [...entries]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 8)
}

/** Top 20 — for two-column sections (e.g. popular splashes) that have room. */
function top20(entries: MetaEntry[]): MetaEntry[] {
  return [...entries]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 20)
}

/** Bottom of a most-X list: lowest non-zero entries, ascending. */
function leastOf(entries: MetaEntry[]): MetaEntry[] {
  return [...entries]
    .filter((e) => Number(e.value || 0) > 0)
    .sort((a, b) => Number(a.value || 0) - Number(b.value || 0))
    .slice(0, 8)
}


export default MetaDashboard
