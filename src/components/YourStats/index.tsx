// @ts-nocheck
/**
 * YourStats — top-level personal stats section for /me.
 *
 *   - useAuth() to read the user.
 *   - !user → render <LoggedOutCTA />. No sample/placeholder data.
 *   - user → a persistent Activity overview strip + tabs: Gameplay, Luck,
 *     Pools, Meta (Gameplay first). The activity counters are a glance-level
 *     overview, so they sit above the tabs rather than in a near-empty tab.
 *   - Receives the page-level date range (since/until) and the era's setCode
 *     as props from the parent (app/me/page.tsx).
 *
 * Auth loading: while AuthContext.loading is true, render a small loading
 * line so we don't flash the LoggedOutCTA to a logged-in user.
 */
'use client'

import { useEffect } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import { useStickyTab } from '@/src/hooks/useStickyTab'
import { ActivityDashboard } from './ActivityDashboard'
import { GameplayDashboard } from './GameplayDashboard'
import { LuckSection } from './LuckSection'
import { LoggedOutCTA } from './LoggedOutCTA'
import { PoolHistoryDashboard } from './PoolHistoryDashboard'
import { MetaDashboard } from './MetaDashboard'
import { getSetConfig, isBeta } from '@/src/utils/setConfigs/index'
import { PATREON_URL } from '@/src/utils/membership'
import './YourStats.css'

/**
 * EarlyAccessCTA — shown when a signed-in user without early access selects an
 * upcoming set (e.g. ASH). Friend-of-the-Pod members get pre-release sets early
 * (R7); everyone else gets the join pitch instead of empty dashboards.
 */
function EarlyAccessCTA({ setCode }: { setCode: string }) {
  const cfg = getSetConfig(setCode)
  const setName = cfg?.setName || setCode
  return (
    <div className="your-stats-logged-out your-stats-early-access" data-testid="your-stats-early-access">
      <div className="your-stats-early-access-badge">Early Access</div>
      <h2 className="your-stats-logged-out-title">{setCode} · {setName} isn&apos;t out yet</h2>
      <p className="your-stats-logged-out-body">
        Become a <strong>Friend of the Pod</strong> to play every new Star Wars:
        Unlimited set the moment spoilers drop — draft and sealed {setCode} pools,
        full stats, and your gameplay history, weeks before release.
      </p>
      <div className="your-stats-logged-out-actions">
        <a href={PATREON_URL} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--md">
          Become a Friend of the Pod
        </a>
      </div>
    </div>
  )
}

type PersonalStatsTab = 'gameplay' | 'luck' | 'pools' | 'meta'

export interface YourStatsProps {
  /** Start of the date range (YYYY-MM-DD) — from the /me era + date picker. */
  since: string
  /** End of the date range (YYYY-MM-DD). */
  until: string
  /** Global Set filter: 'all' or a set code. Drives every tab. */
  setCode?: string
  /** Human label for the active filter (set + range), for empty states. */
  filterLabel?: string
}

export function YourStats({ since, until, setCode = 'all', filterLabel }: YourStatsProps) {
  const { user, loading } = useAuth()
  // Remember the last tab across refresh + Back button (URL ?tab + localStorage).
  const [activeTab, setActiveTab] = useStickyTab<PersonalStatsTab>(
    ['gameplay', 'luck', 'pools', 'meta'],
    'gameplay',
    { param: 'tab', storageKey: 'ptp:me-tab' },
  )

  // Landing on /me clears the "NEW" tag on the My Stats tile (covers arriving
  // here directly, not just via that tile).
  useEffect(() => {
    try { localStorage.setItem('ptp:me-visited', '1') } catch { /* no-op */ }
  }, [])
  // Tabs that need a concrete set (Luck, Meta) fall back to the latest set when
  // the global filter is "all". Pools/Gameplay/Activity treat 'all' as no filter.
  const isAllSets = !setCode || setCode === 'all'
  // Meta aggregates across every set when the global filter is "all" — the
  // dashboard takes setCode='all' and its routes drop the per-set filter. (Luck
  // still resolves a concrete newest set via its own lockedSetCode path.)
  const concreteSet = isAllSets ? 'all' : setCode

  if (loading) {
    return (
      <div
        className="your-stats your-stats--auth-loading"
        data-testid="your-stats-auth-loading"
        aria-busy="true"
      >
        <p className="your-stats-auth-loading-text">Checking sign-in…</p>
      </div>
    )
  }

  // Upcoming set (e.g. ASH) explicitly selected by a signed-in user without
  // early access: pitch Friend of the Pod instead of empty dashboards (R7).
  // Skipped when the filter is "all" — that's a normal browse, not a set pick.
  const setCfg = isAllSets ? null : getSetConfig(setCode)
  const isUpcomingSet = setCfg ? isBeta(setCfg) : false
  const hasEarlyAccess = Boolean(user?.is_beta_tester || user?.is_admin)
  if (user && isUpcomingSet && !hasEarlyAccess) {
    return (
      <div className="your-stats" data-testid="your-stats">
        <EarlyAccessCTA setCode={setCode} />
      </div>
    )
  }

  return (
    <div className="your-stats" data-testid="your-stats">
      {/* Activity overview — glance-level counters, always visible when signed in. */}
      {user && (
        <div className="your-stats-overview">
          <ActivityDashboard since={since} until={until} setCode={setCode} filterLabel={filterLabel} />
        </div>
      )}

      <div className="your-stats-tabs" role="tablist" aria-label="Personal stats sections">
        <button
          type="button"
          className={`your-stats-tab ${activeTab === 'gameplay' ? 'active' : ''}`}
          onClick={() => setActiveTab('gameplay')}
          role="tab"
          aria-selected={activeTab === 'gameplay'}
          aria-controls="your-stats-gameplay-panel"
        >
          Gameplay
        </button>
        <button
          type="button"
          className={`your-stats-tab ${activeTab === 'luck' ? 'active' : ''}`}
          onClick={() => setActiveTab('luck')}
          role="tab"
          aria-selected={activeTab === 'luck'}
          aria-controls="your-stats-luck-panel"
          disabled={!user}
          title={!user ? 'Sign in to see your luck' : undefined}
        >
          Luck
        </button>
        <button
          type="button"
          className={`your-stats-tab ${activeTab === 'pools' ? 'active' : ''}`}
          onClick={() => setActiveTab('pools')}
          role="tab"
          aria-selected={activeTab === 'pools'}
          aria-controls="your-stats-pools-panel"
          disabled={!user}
          title={!user ? 'Sign in to see your pools' : undefined}
        >
          Pools
        </button>
        <button
          type="button"
          className={`your-stats-tab ${activeTab === 'meta' ? 'active' : ''}`}
          onClick={() => setActiveTab('meta')}
          role="tab"
          aria-selected={activeTab === 'meta'}
          aria-controls="your-stats-meta-panel"
          disabled={!user}
          title={!user ? 'Sign in to see the meta' : undefined}
        >
          Meta
        </button>
      </div>

      <div className="your-stats-content">
        {!user ? (
          <div id="your-stats-gameplay-panel" role="tabpanel">
            <LoggedOutCTA />
          </div>
        ) : activeTab === 'gameplay' ? (
          <div id="your-stats-gameplay-panel" role="tabpanel">
            <GameplayDashboard since={since} until={until} setCode={setCode} />
          </div>
        ) : activeTab === 'luck' ? (
          <div id="your-stats-luck-panel" role="tabpanel">
            {/* Luck is inherently per-set. With a specific set chosen globally we
                lock to it (no repeated selector); with "All" we let the user pick. */}
            <LuckSection since={since} until={until} lockedSetCode={isAllSets ? undefined : setCode} includeBetaSets={Boolean(user?.is_beta_tester || user?.is_admin)} />
          </div>
        ) : activeTab === 'pools' ? (
          <div id="your-stats-pools-panel" role="tabpanel">
            <PoolHistoryDashboard setFilter={setCode} />
          </div>
        ) : (
          <div id="your-stats-meta-panel" role="tabpanel">
            <MetaDashboard since={since} until={until} setCode={concreteSet} lockSet={!isAllSets} includeBetaSets={Boolean(user?.is_beta_tester || user?.is_admin)} />
          </div>
        )}
      </div>
    </div>
  )
}

export default YourStats
