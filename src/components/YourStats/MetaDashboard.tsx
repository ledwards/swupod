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

/** Win-rate section: gated behind the Companion because WR needs captured games. */
function WinRateGate({ leaders }: { leaders: MetaEntry[] }) {
  // Render the leader list with placeholder bars, then blur + overlay the CTA.
  // When the Companion is already installed (R10), don't pitch the install —
  // the user just needs to play captured games for win rates to populate.
  const { detected } = useWayfinderDetection()
  const teaser = leaders.slice(0, 6)
  return (
    <section className="your-stats-meta-card your-stats-meta-card--gated">
      <header className="your-stats-meta-card-header">
        <div>
          <span className="your-stats-eyebrow">Win Rate</span>
          <h3>Win rate by leader</h3>
        </div>
      </header>
      <div className="your-stats-meta-gate">
        <div className="your-stats-meta-gate-blur" aria-hidden="true">
          <div className="your-stats-meta-bars">
            {(teaser.length ? teaser : Array.from({ length: 5 }, (_, i) => ({ name: `Leader ${i + 1}`, value: 60 - i * 4, aspects: [], loggedIn: null, imageUrl: null }))).map((e, i) => {
              const color = getAspectColor({ aspects: e.aspects } as never)
              const width = 70 - i * 9
              return (
                <div key={e.name} className="your-stats-meta-bar-row">
                  <div className="your-stats-meta-bar-head">
                    <span className="your-stats-meta-bar-name">{e.name}</span>
                    <span className="your-stats-meta-bar-value" style={{ color }}>5X.X%</span>
                  </div>
                  <div className="your-stats-meta-bar-track">
                    <span className="your-stats-meta-bar-fill" style={{ width: `${width}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="your-stats-meta-gate-cta">
          <span className="your-stats-meta-gate-lock" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          {detected ? (
            <>
              <h4>Play to see your win rates</h4>
              <p>The Companion is connected. Queue your pools on Karabast and your win rate by leader fills in here.</p>
            </>
          ) : (
            <>
              <h4>Give data to get data</h4>
              <p>Win rates come from games captured through the Wayfinder Companion. Install it, play your pool on Karabast, and leader win rates unlock here.</p>
              <WayfinderStoreButtons orientation="inline" />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export function MetaDashboard({ since, until, setCode = DEFAULT_STATS_SET_TAB, lockSet = false, includeBetaSets = false, fetchImpl }: MetaDashboardProps) {
  const setTabs = useMemo(() => getStatsSetTabs(includeBetaSets), [includeBetaSets])
  const [activeSet, setActiveSet] = useState<string>(setTabs.includes(setCode) ? setCode : DEFAULT_STATS_SET_TAB)
  const [state, setState] = useState({ loading: true, error: false, played: [] as MetaEntry[], drafted: [] as MetaEntry[] })

  // Follow the era's set when it changes (unless the user picked one explicitly is fine to override here).
  useEffect(() => {
    if (setTabs.includes(setCode)) setActiveSet(setCode)
  }, [setCode, setTabs])

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
          <WinRateGate leaders={state.played} />
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
          </div>
        </>
      )}
    </section>
  )
}

export default MetaDashboard
