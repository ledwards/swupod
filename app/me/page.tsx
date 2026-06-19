'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import UserAvatar from '@/src/components/UserAvatar'
import YourStats from '@/src/components/YourStats'
import { getEras, getWeeks, todayStr } from '@/src/utils/statsEras'
import { getDefaultStatsSetTab } from '@/src/utils/statsSetTabs'
import '../stats/stats.css'

// "All" range = the set's entire history, up to today. The release-era window is
// wrong for an upcoming set (ASH's window is a future date, which excludes games
// played NOW during spoilers/beta) and for any set it hides pre-release play. A
// specific week still narrows to that week.
const ALL_TIME_START = '2020-01-01'

export default function MePage() {
  const { user, isPatron } = useAuth() as {
    user: { username?: string; avatar_url?: string | null; is_beta_tester?: boolean; is_admin?: boolean } | null
    isPatron?: boolean
  }

  const eras = useMemo(() => getEras(), [])
  // Early access = beta tester or admin — the same gate as /stats and the
  // EarlyAccessCTA. It decides whether a pre-release set counts as the "latest
  // set" this viewer can actually open.
  const hasEarlyAccess = Boolean(user?.is_beta_tester || user?.is_admin)
  // Global Set filter — drives every tab. Defaults to the newest set the viewer
  // can open: the upcoming pre-release set (e.g. ASH) for early-access users, the
  // newest released set for everyone else. Uses the shared beta-aware helper so
  // "latest set" means the same thing here, on /stats, and in the Luck/Meta tabs.
  const [setFilter, setSetFilter] = useState<string>(() => getDefaultStatsSetTab(hasEarlyAccess))
  // Once the viewer picks a set, the post-auth re-sync below must not clobber it.
  const userPickedSet = useRef(false)
  // 'all' = whole era; otherwise an index into the era's weeks.
  const [weekKey, setWeekKey] = useState<'all' | number>('all')

  // useAuth resolves after mount, so the initial default is computed before we
  // know the viewer's access. Re-sync once access is known so a beta/admin viewer
  // lands on ASH (and only they do) — unless they've already chosen a set.
  useEffect(() => {
    if (userPickedSet.current) return
    setSetFilter(getDefaultStatsSetTab(hasEarlyAccess))
  }, [hasEarlyAccess])

  const era = useMemo(
    () => (setFilter === 'all' ? null : eras.find((e) => e.setCode === setFilter) || null),
    [eras, setFilter],
  )
  const weeks = useMemo(() => (era ? getWeeks(era) : []), [era])

  const { startDate, endDate } = useMemo(() => {
    if (!era) return { startDate: ALL_TIME_START, endDate: todayStr() }
    if (weekKey === 'all') return { startDate: ALL_TIME_START, endDate: todayStr() }
    const w = weeks[weekKey]
    return w ? { startDate: w.start, endDate: w.end } : { startDate: era.start, endDate: era.end }
  }, [era, weekKey, weeks])

  const filterLabel = useMemo(() => {
    const setPart = setFilter === 'all' ? 'All sets' : setFilter
    if (!era || weekKey === 'all') return setPart
    return `${setPart} · ${weeks[weekKey]?.label || ''}`.trim()
  }, [setFilter, era, weekKey, weeks])

  // Eyebrow is the page identity ("My Stats"); the H1 is the person. Signed out,
  // fall back to a benefit-framed title so we don't stutter "My Stats / My Stats".
  const displayName = user?.username || 'Your Performance'

  return (
    <div className="stats-page me-page">
      <header className="me-hero">
        <div className="me-hero-identity">
          {user ? (
            <UserAvatar
              size={66}
              src={user.avatar_url ?? null}
              alt={user.username || 'You'}
              isPatron={Boolean(isPatron)}
              fallback={(user.username || 'U').charAt(0).toUpperCase()}
              className="me-hero-avatar"
            />
          ) : (
            <span className="me-hero-avatar me-hero-avatar--anon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
          )}
          <div className="me-hero-titles">
            <span className="me-hero-eyebrow">My Stats</span>
            <h1>{displayName}</h1>
            <p>Gameplay and pull data from your Protect the Pod pools</p>
          </div>
        </div>

        <div className="me-hero-toolbar">
          <div className="stats-date-range me-range">
            <label className="me-range-field">
              <span>Set</span>
              <select
                value={setFilter}
                onChange={(e) => {
                  userPickedSet.current = true
                  setSetFilter(e.target.value)
                  setWeekKey('all')
                }}
              >
                <option value="all">All sets</option>
                {eras.map((e) => (
                  <option key={e.setCode} value={e.setCode}>{e.setCode}</option>
                ))}
              </select>
            </label>
            {era && (
              <label className="me-range-field">
                <span>Range</span>
                <select
                  value={String(weekKey)}
                  onChange={(e) => setWeekKey(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">Whole era</option>
                  {weeks.map((w, i) => (
                    <option key={w.start} value={i}>{w.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {user && (
            <button
              className="me-export-btn"
              onClick={() => {
                window.location.href = '/api/export/personal'
              }}
              title="Download Personal Data"
              aria-label="Download Personal Data"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <YourStats since={startDate} until={endDate} setCode={setFilter} filterLabel={filterLabel} />
    </div>
  )
}
