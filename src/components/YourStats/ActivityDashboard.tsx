// @ts-nocheck
/**
 * ActivityDashboard — the five-counter activity totals.
 *
 * Per plan U7 / R3, R5, R13:
 *   - Counters: Packs cracked, Pools opened, Drafts joined, Decks built, Made it to play.
 *   - Fetches GET /api/stats/me/summary?since&until on mount and on date-range change.
 *   - Loading: five skeleton placeholders shaped like the counters (.skeleton-line).
 *   - Error: counters render as "—" with a small "couldn't load activity" note.
 *   - Empty (all five zero): single-line CTA, not five zeros.
 *   - Mobile <= 520px: wraps to 2x3 grid (handled in YourStats.css).
 *   - R13: optional "Tracking started YYYY-MM-DD" line when `since` is before
 *     the global stats cutoff. We render it on a best-effort basis when
 *     `since` < cutoff. We don't separately fetch activity-before-cutoff;
 *     the plan says "keep simple, fetch isn't required here."
 */
'use client'

import { useEffect, useState } from 'react'
import WayfinderStoreButtons from '@/src/components/WayfinderStoreButtons'

const STATS_START_DATE = process.env.NEXT_PUBLIC_STATS_START_DATE || '2026-02-12'

export interface ActivitySummary {
  packsCracked: number
  poolsOpened: number
  draftsJoined: number
  decksBuilt: number
  decksPlayed: number
}

export interface ActivityDashboardProps {
  since: string
  until: string
  /**
   * Test seam — if provided, used in place of window.fetch. Lets tests
   * inject deterministic responses without monkeypatching globals.
   */
  fetchImpl?: typeof fetch
}

interface FetchState {
  loading: boolean
  error: boolean
  data: ActivitySummary | null
}

function isBeforeCutoff(since: string): boolean {
  // Lexicographic compare on YYYY-MM-DD strings is correct.
  if (!since || since.length < 10) return false
  return since < STATS_START_DATE
}

function CounterCell({
  label,
  value,
  testId,
}: {
  label: string
  value: number | string
  testId: string
}) {
  return (
    <div className="your-stats-counter" data-testid={testId}>
      <div className="your-stats-counter-value">{value}</div>
      <div className="your-stats-counter-label">{label}</div>
    </div>
  )
}

function SkeletonCell({ testId }: { testId: string }) {
  return (
    <div className="your-stats-counter your-stats-counter--skeleton" data-testid={testId}>
      <div className="skeleton-line your-stats-counter-skeleton-value" />
      <div className="skeleton-line your-stats-counter-skeleton-label" />
    </div>
  )
}

const COUNTER_KEYS: Array<{ key: keyof ActivitySummary; label: string; testId: string }> = [
  { key: 'packsCracked', label: 'Packs cracked', testId: 'counter-packs-cracked' },
  { key: 'poolsOpened', label: 'Pools opened', testId: 'counter-pools-opened' },
  { key: 'draftsJoined', label: 'Drafts joined', testId: 'counter-drafts-joined' },
  { key: 'decksBuilt', label: 'Decks built', testId: 'counter-decks-built' },
  { key: 'decksPlayed', label: 'Made it to play', testId: 'counter-decks-played' },
]

export function ActivityDashboard({ since, until, fetchImpl }: ActivityDashboardProps) {
  const [state, setState] = useState<FetchState>({ loading: true, error: false, data: null })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: false }))
    const params = new URLSearchParams({ since, until })
    const f = fetchImpl || fetch
    f(`/api/stats/me/summary?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`summary fetch failed: ${r.status}`)
        return r.json()
      })
      .then((body) => {
        if (cancelled) return
        // The route returns { packsCracked, poolsOpened, ... } directly (no envelope).
        // Defend against either shape (envelope or bare) without assuming.
        const data = body && body.data ? body.data : body
        setState({ loading: false, error: false, data })
      })
      .catch((err) => {
        if (cancelled) return
        // Swallow stack noise — stats are non-critical.
        // eslint-disable-next-line no-console
        console.error('ActivityDashboard fetch error:', err)
        setState({ loading: false, error: true, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [since, until, fetchImpl])

  const showTrackingLine = isBeforeCutoff(since)

  // Loading: render five skeletons.
  if (state.loading) {
    return (
      <section
        className="your-stats-activity"
        data-testid="activity-dashboard"
        aria-busy="true"
        aria-label="Your activity (loading)"
      >
        <h3 className="your-stats-section-heading">Activity</h3>
        <div className="your-stats-counter-grid">
          {COUNTER_KEYS.map(({ key, testId }) => (
            <SkeletonCell key={key} testId={`${testId}-skeleton`} />
          ))}
        </div>
      </section>
    )
  }

  // Error: render five dashes + a note.
  if (state.error || !state.data) {
    return (
      <section
        className="your-stats-activity"
        data-testid="activity-dashboard"
        aria-label="Your activity"
      >
        <h3 className="your-stats-section-heading">Activity</h3>
        <div className="your-stats-counter-grid">
          {COUNTER_KEYS.map(({ key, label, testId }) => (
            <CounterCell key={key} label={label} value="—" testId={testId} />
          ))}
        </div>
        <p className="your-stats-error-note" role="status">
          Couldn't load activity. Try refreshing.
        </p>
      </section>
    )
  }

  const data = state.data
  const allZero =
    data.packsCracked === 0 &&
    data.poolsOpened === 0 &&
    data.draftsJoined === 0 &&
    data.decksBuilt === 0 &&
    data.decksPlayed === 0

  // First-use empty state: one friendly line, not five zeros.
  if (allZero) {
    return (
      <section
        className="your-stats-activity"
        data-testid="activity-dashboard"
        aria-label="Your activity"
      >
        <h3 className="your-stats-section-heading">Activity</h3>
        <div className="your-stats-companion-empty" data-testid="activity-empty">
          <h4>Start capturing play data</h4>
          <p>
            Install the Wayfinder Companion, play your Protect the Pod pool on
            Karabast, and your matches can become stats and replays here.
          </p>
          <ul>
            <li>Join the Karabast queue with your pool</li>
            <li>Collect stats tied to that pool</li>
            <li>Record and rewatch your replays</li>
          </ul>
          <div className="your-stats-companion-empty-actions">
            <WayfinderStoreButtons orientation="inline" />
            <span>
              Or start with a <a href="/sealed" className="your-stats-link">sealed pool</a> or{' '}
              <a href="/draft" className="your-stats-link">draft</a>.
            </span>
          </div>
        </div>
        {showTrackingLine && (
          <p className="your-stats-tracking-line">
            Tracking started {STATS_START_DATE}.
          </p>
        )}
      </section>
    )
  }

  return (
    <section
      className="your-stats-activity"
      data-testid="activity-dashboard"
      aria-label="Your activity"
    >
      <h3 className="your-stats-section-heading">Activity</h3>
      <div className="your-stats-counter-grid">
        {COUNTER_KEYS.map(({ key, label, testId }) => (
          <CounterCell
            key={key}
            label={label}
            value={Number(data[key] || 0).toLocaleString()}
            testId={testId}
          />
        ))}
      </div>
      {showTrackingLine && (
        <p className="your-stats-tracking-line">
          Tracking started {STATS_START_DATE}.
        </p>
      )}
    </section>
  )
}

export default ActivityDashboard
