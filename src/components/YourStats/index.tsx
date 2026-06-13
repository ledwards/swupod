// @ts-nocheck
/**
 * YourStats — top-level personal stats section for /stats#you.
 *
 * Per plan U7:
 *   - useAuth() to read the user.
 *   - !user → render <LoggedOutCTA />. No sample/placeholder data.
 *   - user → render <ActivityDashboard /> then <LuckSection />.
 *   - Receives the page-level date range as props from the parent (U8 mounts
 *     this in app/stats/page.tsx and passes startDate/endDate down).
 *
 * Auth loading: while AuthContext.loading is true, render a small loading
 * line so we don't flash the LoggedOutCTA to a logged-in user.
 */
'use client'

import { useAuth } from '@/src/contexts/AuthContext'
import { ActivityDashboard } from './ActivityDashboard'
import { LuckSection } from './LuckSection'
import { LoggedOutCTA } from './LoggedOutCTA'
import './YourStats.css'

export interface YourStatsProps {
  /** Start of the date range (YYYY-MM-DD) — typically from the /stats date picker. */
  since: string
  /** End of the date range (YYYY-MM-DD). */
  until: string
}

export function YourStats({ since, until }: YourStatsProps) {
  const { user, loading } = useAuth()

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

  if (!user) {
    return (
      <div className="your-stats" data-testid="your-stats">
        <LoggedOutCTA />
      </div>
    )
  }

  return (
    <div className="your-stats" data-testid="your-stats">
      <ActivityDashboard since={since} until={until} />
      <LuckSection
        since={since}
        until={until}
        includeBetaSets={Boolean(user?.is_beta_tester || user?.is_admin)}
      />
    </div>
  )
}

export default YourStats
