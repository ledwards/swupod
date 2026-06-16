'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import UserAvatar from '@/src/components/UserAvatar'
import YourStats from '@/src/components/YourStats'
import { getEras, getCurrentEra, getWeeks, todayStr } from '@/src/utils/statsEras'
import { DEFAULT_STATS_SET_TAB } from '@/src/utils/statsSetTabs'
import '../stats/stats.css'

// Tracking floor — kept for the activity "tracking started" line and as a fallback.
const DEFAULT_START_DATE = process.env.NEXT_PUBLIC_STATS_START_DATE || '2026-02-12'

export default function MePage() {
  const { user, isPatron } = useAuth() as {
    user: { username?: string; avatar_url?: string | null } | null
    isPatron?: boolean
  }

  const eras = useMemo(() => getEras(), [])
  const [eraCode, setEraCode] = useState<string>(() => getCurrentEra(eras)?.setCode || DEFAULT_STATS_SET_TAB)
  // 'all' = whole era; otherwise an index into the era's weeks.
  const [weekKey, setWeekKey] = useState<'all' | number>('all')

  const era = useMemo(() => eras.find((e) => e.setCode === eraCode) || eras[0] || null, [eras, eraCode])
  const weeks = useMemo(() => (era ? getWeeks(era) : []), [era])

  const { startDate, endDate } = useMemo(() => {
    if (!era) return { startDate: DEFAULT_START_DATE, endDate: todayStr() }
    if (weekKey === 'all') return { startDate: era.start, endDate: era.end }
    const w = weeks[weekKey]
    return w ? { startDate: w.start, endDate: w.end } : { startDate: era.start, endDate: era.end }
  }, [era, weekKey, weeks])

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
              <span>Era</span>
              <select
                value={eraCode}
                onChange={(e) => {
                  setEraCode(e.target.value)
                  setWeekKey('all')
                }}
              >
                {eras.map((e) => (
                  <option key={e.setCode} value={e.setCode}>{e.label}</option>
                ))}
              </select>
            </label>
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

      <YourStats since={startDate} until={endDate} setCode={eraCode} />
    </div>
  )
}
