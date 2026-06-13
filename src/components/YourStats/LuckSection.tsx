// @ts-nocheck
/**
 * LuckSection — set selector + scope toggle + 3 panels (rarity, aspect, streaks).
 *
 * Per plan U7 / R6, R7, R8, R12:
 *   - Set selector: defaults to LAW (current set). Button variant="toggle"
 *     row on desktop, native <select> on mobile (CSS handles which is shown).
 *   - Scope toggle: "Packs I opened" (default) vs "What I kept", Button
 *     variant="toggle" with glowColor="blue".
 *   - Fetches GET /api/stats/me/luck?setCode&scope&since&until on change.
 *   - Stale-while-updating: keep current data with 50% opacity + "Updating…"
 *     header on subsequent fetches.
 *   - Empty state (packsCracked === 0): friendly "open a sealed pool or
 *     join a draft" with links to /sealed and /draft.
 *
 * Set list comes from src/utils/statsSetTabs so the global stats tabs and
 * the You tab stay in sync, including beta-accessible sets.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/src/components/Button'
import { LuckPanel } from './LuckPanel'
import { StreaksPanel } from './StreaksPanel'
import { DEFAULT_STATS_SET_TAB, getStatsSetTabs } from '@/src/utils/statsSetTabs'

// Defaulting to LAW is pragmatic; the brainstorm says "most recent set with
// activity" but a cheap fetch would be a second roundtrip.
const DEFAULT_SET = DEFAULT_STATS_SET_TAB

type Scope = 'opened' | 'kept'
const SCOPE_LABEL: Record<Scope, string> = {
  opened: 'Packs I opened',
  kept: 'What I kept',
}

export interface LuckPayload {
  setCode: string
  scope: Scope
  packsCracked: number
  rarity: any
  aspect: any
  streaks: any[]
  streaksHasMore: boolean
}

interface FetchState {
  loading: boolean
  refetching: boolean
  error: boolean
  data: LuckPayload | null
}

export interface LuckSectionProps {
  since: string
  until: string
  fetchImpl?: typeof fetch
  /**
   * Optional initial set (used by tests). Defaults to LAW.
   */
  initialSet?: string
  /**
   * Include beta-only set tabs before prerelease. The parent derives this from
   * the authenticated user's beta/admin access.
   */
  includeBetaSets?: boolean
}

export function LuckSection({ since, until, fetchImpl, initialSet, includeBetaSets = false }: LuckSectionProps) {
  const [setCode, setSetCode] = useState<string>(initialSet || DEFAULT_SET)
  const [scope, setScope] = useState<Scope>('opened')
  const [state, setState] = useState<FetchState>({
    loading: true,
    refetching: false,
    error: false,
    data: null,
  })
  const setTabs = useMemo(() => getStatsSetTabs(includeBetaSets), [includeBetaSets])

  useEffect(() => {
    if (setTabs.includes(setCode)) return
    setSetCode(DEFAULT_SET)
  }, [setCode, setTabs])

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({
      ...prev,
      // First load: hard loading; after that, refetching keeps old data visible.
      loading: prev.data === null,
      refetching: prev.data !== null,
      error: false,
    }))
    const params = new URLSearchParams({ setCode, scope, since, until })
    const f = fetchImpl || fetch
    f(`/api/stats/me/luck?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`luck fetch failed: ${r.status}`)
        return r.json()
      })
      .then((body) => {
        if (cancelled) return
        const data = body && body.data ? body.data : body
        setState({ loading: false, refetching: false, error: false, data })
      })
      .catch((err) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('LuckSection fetch error:', err)
        setState((prev) => ({ ...prev, loading: false, refetching: false, error: true }))
      })
    return () => {
      cancelled = true
    }
  }, [setCode, scope, since, until, fetchImpl])

  const headerSuffix = state.refetching ? ' · Updating…' : ''

  const dataPanelOpacity = state.refetching ? 0.5 : 1

  return (
    <section
      className="your-stats-luck-section"
      data-testid="luck-section"
      aria-label="Your luck analysis"
    >
      <div className="your-stats-luck-section-header">
        <h3 className="your-stats-section-heading">
          Luck{headerSuffix}
        </h3>
      </div>

      {/* Set selector: button row on desktop, native select on mobile.
          Both controls are always in the DOM; CSS toggles which is visible. */}
      <div className="your-stats-luck-controls">
        <div className="your-stats-luck-set-selector">
          <span className="your-stats-control-label" id="your-stats-set-label">
            Set
          </span>
          <div
            className="your-stats-luck-set-buttons"
            role="radiogroup"
            aria-labelledby="your-stats-set-label"
          >
            {setTabs.map((s) => (
              <Button
                key={s}
                variant="toggle"
                size="sm"
                glowColor="blue"
                active={setCode === s}
                onClick={() => setSetCode(s)}
                role="radio"
                aria-checked={setCode === s}
                data-testid={`set-button-${s}`}
              >
                {s}
              </Button>
            ))}
          </div>
          <select
            className="your-stats-luck-set-native"
            aria-labelledby="your-stats-set-label"
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            data-testid="set-select-mobile"
          >
            {setTabs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="your-stats-luck-scope-selector">
          <span className="your-stats-control-label" id="your-stats-scope-label">
            Scope
          </span>
          <div
            className="your-stats-luck-scope-buttons"
            role="radiogroup"
            aria-labelledby="your-stats-scope-label"
          >
            {(['opened', 'kept'] as Scope[]).map((s) => (
              <Button
                key={s}
                variant="toggle"
                size="sm"
                glowColor="blue"
                active={scope === s}
                onClick={() => setScope(s)}
                role="radio"
                aria-checked={scope === s}
                data-testid={`scope-button-${s}`}
              >
                {SCOPE_LABEL[s]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      {state.loading ? (
        <div
          className="your-stats-luck-body your-stats-luck-body--loading"
          data-testid="luck-loading"
          aria-busy="true"
        >
          <div className="skeleton-line your-stats-luck-skeleton" />
          <div className="skeleton-line your-stats-luck-skeleton" />
          <div className="skeleton-line your-stats-luck-skeleton" />
        </div>
      ) : state.error || !state.data ? (
        <div
          className="your-stats-luck-body your-stats-luck-body--error"
          data-testid="luck-error"
        >
          <p>Couldn't load your luck data. Try refreshing.</p>
        </div>
      ) : state.data.packsCracked === 0 ? (
        <div
          className="your-stats-luck-body your-stats-luck-body--empty"
          data-testid="luck-empty"
          style={{ opacity: dataPanelOpacity }}
        >
          <p>
            No {setCode} packs yet — open a{' '}
            <a href="/sealed" className="your-stats-link">sealed pool</a> or{' '}
            <a href="/draft" className="your-stats-link">join a draft</a>.
          </p>
        </div>
      ) : (
        <div
          className="your-stats-luck-body"
          style={{ opacity: dataPanelOpacity }}
          data-testid="luck-panels"
        >
          <LuckPanel
            dimension="rarity"
            data={state.data.rarity}
            packsCracked={state.data.packsCracked}
            title="Rarity"
          />
          <LuckPanel
            dimension="aspect"
            data={state.data.aspect}
            packsCracked={state.data.packsCracked}
            title="Aspect mix"
          />
          <StreaksPanel
            streaks={state.data.streaks || []}
            streaksHasMore={Boolean(state.data.streaksHasMore)}
          />
        </div>
      )}
    </section>
  )
}

export default LuckSection
