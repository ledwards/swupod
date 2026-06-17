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
import WayfinderStoreButtons from '@/src/components/WayfinderStoreButtons'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'
import { getStatsSetTabs, DEFAULT_STATS_SET_TAB } from '@/src/utils/statsSetTabs'
import { getAspectColor } from '@/src/utils/aspectColors'

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
                {e.loggedIn != null && (
                  <small className="your-stats-meta-loggedin" title="Logged-in players">({pct(e.loggedIn)})</small>
                )}
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

function MetaSection({
  eyebrow,
  title,
  subtitle,
  entries,
  loading,
}: {
  eyebrow: string
  title: string
  subtitle: string
  entries: MetaEntry[]
  loading: boolean
}) {
  const max = useMemo(() => Math.max(0, ...entries.map((e) => e.value)), [entries])
  return (
    <section className="your-stats-meta-card">
      <header className="your-stats-meta-card-header">
        <div>
          <span className="your-stats-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <span className="your-stats-meta-legend">all <em>(logged-in)</em></span>
      </header>
      <p className="your-stats-meta-subtitle">{subtitle}</p>
      {loading ? (
        <div className="your-stats-meta-bars">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-line your-stats-meta-skeleton" />
          ))}
        </div>
      ) : (
        <MetricBars entries={entries} max={max} />
      )}
    </section>
  )
}

export function MetaDashboard({ since, until, setCode = DEFAULT_STATS_SET_TAB, lockSet = false, includeBetaSets = false, fetchImpl }: MetaDashboardProps) {
  const setTabs = useMemo(() => getStatsSetTabs(includeBetaSets), [includeBetaSets])
  const [activeSet, setActiveSet] = useState<string>(setTabs.includes(setCode) ? setCode : DEFAULT_STATS_SET_TAB)
  const [state, setState] = useState({ loading: true, error: false, played: [] as MetaEntry[], drafted: [] as MetaEntry[] })
  // The viewer's REAL win rate by leader, from their captured games — shown
  // outright (no blur gate). Empty until they have recorded games.
  const [winRates, setWinRates] = useState<Array<{ leaderName: string; winRate: number; matches: number; leaderImageUrl: string | null; baseColor: string | null }>>([])

  // Follow the era's set when it changes (unless the user picked one explicitly is fine to override here).
  useEffect(() => {
    if (setTabs.includes(setCode)) setActiveSet(setCode)
  }, [setCode, setTabs])

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
    Promise.all([
      getJson(f, `/api/stats/leader-selection?${base}`),
      getJson(f, `/api/stats/leader-selection?${base}&loggedInOnly=true`),
      getJson(f, `/api/stats/draft-picks?${base}&type=leaders`),
      getJson(f, `/api/stats/draft-picks?${base}&type=leaders&loggedInOnly=true`),
    ])
      .then(([playedAll, playedIn, draftAll, draftIn]) => {
        if (cancelled) return
        const playedInMap = new Map((playedIn.leaders || []).map((l: any) => [l.cardName, l.selectionRate]))
        const played: MetaEntry[] = (playedAll.leaders || []).slice(0, 8).map((l: any) => ({
          name: l.cardName,
          value: Number(l.selectionRate || 0),
          loggedIn: playedInMap.has(l.cardName) ? Number(playedInMap.get(l.cardName)) : null,
          aspects: l.aspects || [],
          imageUrl: l.imageUrl || null,
        }))

        const draftInMap = new Map((draftIn.cards || []).map((c: any) => [c.cardName, c.firstPickPct]))
        const drafted: MetaEntry[] = (draftAll.cards || [])
          .slice()
          .sort((a: any, b: any) => Number(b.firstPickPct || 0) - Number(a.firstPickPct || 0))
          .slice(0, 8)
          .map((c: any) => ({
            name: c.cardName,
            value: Number(c.firstPickPct || 0),
            loggedIn: draftInMap.has(c.cardName) ? Number(draftInMap.get(c.cardName)) : null,
            aspects: c.aspects || [],
            imageUrl: c.imageUrl || null,
          }))

        setState({ loading: false, error: false, played, drafted })
      })
      .catch((err) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('MetaDashboard fetch error:', err)
        setState({ loading: false, error: true, played: [], drafted: [] })
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
          <div className="your-stats-meta-grid">
            <MetaSection
              eyebrow="Deckbuilding"
              title="Most-played leaders"
              subtitle="Share of built decks that chose each leader."
              entries={state.played}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Drafting"
              title="Most-drafted leaders"
              subtitle="How often each leader is taken first in the draft."
              entries={state.drafted}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Deckbuilding"
              title="Least-played leaders"
              subtitle="The leaders the field almost never builds."
              entries={leastOf(state.played)}
              loading={state.loading}
            />
            <MetaSection
              eyebrow="Drafting"
              title="Least-drafted leaders"
              subtitle="The leaders most often passed in the draft."
              entries={leastOf(state.drafted)}
              loading={state.loading}
            />
          </div>
        </>
      )}
    </section>
  )
}

/** Bottom of a most-X list: lowest non-zero entries, ascending. */
function leastOf(entries: MetaEntry[]): MetaEntry[] {
  return [...entries]
    .filter((e) => Number(e.value || 0) > 0)
    .sort((a, b) => Number(a.value || 0) - Number(b.value || 0))
    .slice(0, 8)
}

/** Real win rate by leader from the viewer's captured games — shown outright. */
function WinRateCard({ leaders }: { leaders: Array<{ leaderName: string; winRate: number; matches: number; leaderImageUrl: string | null; baseColor: string | null }> }) {
  const { detected } = useWayfinderDetection()
  const ranked = [...leaders].filter((l) => l.matches > 0).sort((a, b) => b.winRate - a.winRate).slice(0, 8)
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
        <div className="your-stats-meta-bars">
          {ranked.map((l) => {
            const color = l.baseColor || getAspectColor({ aspects: [] } as never)
            const width = Math.max(2, Math.min(100, Number(l.winRate || 0)))
            return (
              <div key={l.leaderName} className="your-stats-meta-bar-row">
                <div className="your-stats-meta-bar-head">
                  <span className="your-stats-meta-bar-name">{l.leaderName}</span>
                  <span className="your-stats-meta-bar-value" style={{ color }}>{Number(l.winRate || 0).toFixed(1)}% · {l.matches}g</span>
                </div>
                <div className="your-stats-meta-bar-track">
                  <span className="your-stats-meta-bar-fill" style={{ width: `${width}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default MetaDashboard
