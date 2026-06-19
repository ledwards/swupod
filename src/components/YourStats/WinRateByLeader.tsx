// @ts-nocheck
'use client'

/**
 * WinRateByLeader — the cropped-art leader grid with a tap/hover base-aspect
 * readout. Used twice: META-WIDE on the Meta tab (all players) and PERSONAL on
 * the Gameplay tab (your captured games). Same shape (leaderBreakdown with
 * byBase); only the title and empty-state copy differ.
 */

import { useMemo, useState } from 'react'
import { ASPECT_COLORS } from '@/src/utils/aspectColors'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'

export interface BaseSplit { aspect: string; winRate: number; matches: number; wins?: number; losses?: number; draws?: number }
export interface WinRateLeader {
  leaderName: string
  winRate: number
  matches: number
  wins?: number
  losses?: number
  draws?: number
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseColor: string | null
  byBase: BaseSplit[]
}

/** "2 matches" / "1 match" — never the cryptic "2g". */
function matchesLabel(n: number): string {
  return `${n} ${n === 1 ? 'match' : 'matches'}`
}
/** Real record: "3–1" or "3–1–1" when there are draws. */
function recordLabel(w?: number, l?: number, d?: number): string | null {
  if (w == null || l == null) return null
  return d ? `${w}–${l}–${d}` : `${w}–${l}`
}

const WR_ASPECT_ICON: Record<string, string> = {
  Vigilance: '/icons/vigilance.png',
  Command: '/icons/command.png',
  Aggression: '/icons/aggression.png',
  Cunning: '/icons/cunning.png',
}

/** Win % colored red (low) → green (high) for the square overlay. */
function winRateColor(wr: number): string {
  const hue = Math.max(0, Math.min(120, (wr / 100) * 120))
  return `hsl(${hue}, 70%, 45%)`
}

function BaseBars({ leader }: { leader: WinRateLeader }) {
  return (
    <div className="your-stats-wr-readout">
      <div className="your-stats-wr-readout-head">
        <strong>{leader.leaderName}</strong>
        <span>
          {leader.matches > 0 ? (
            <>
              {leader.winRate.toFixed(1)}%
              {recordLabel(leader.wins, leader.losses, leader.draws) ? ` · ${recordLabel(leader.wins, leader.losses, leader.draws)}` : ''}
              {' · '}{matchesLabel(leader.matches)}
            </>
          ) : 'No games yet'}
        </span>
      </div>
      {leader.byBase.length === 0 ? (
        <p className="your-stats-meta-empty">{leader.matches > 0 ? 'No base breakdown yet.' : 'No games recorded with this leader yet.'}</p>
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
              <span className="your-stats-wr-bar-val">{b.winRate.toFixed(0)}%{recordLabel(b.wins, b.losses, b.draws) ? ` · ${recordLabel(b.wins, b.losses, b.draws)}` : ''} · {matchesLabel(b.matches)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function WinRateByLeader({
  leaders,
  title,
  mode,
  eyebrow = 'Win Rate',
  companionBeta = true,
  showFullRoster = false,
}: {
  leaders: WinRateLeader[]
  title: string
  mode: 'personal' | 'meta'
  eyebrow?: string
  /** Beta users get the Companion install pitch in the empty state; others get a
   *  neutral "coming soon". Defaults true (meta usage isn't a plugin pitch). */
  companionBeta?: boolean
  /** Meta on a single set: show every leader in the set (unplayed → "–") instead
   *  of a top-12. Off for the "all sets" aggregate and the personal Gameplay tab. */
  showFullRoster?: boolean
}) {
  const { detected } = useWayfinderDetection()
  const ranked = useMemo(() => {
    // A specific set's Meta view shows the FULL roster (every leader, "–" until it
    // has games): leaders with games lead, sorted by win rate; the rest follow A→Z.
    // Personal and the "all sets" aggregate stay a focused top-12 of played leaders.
    if (mode === 'meta' && showFullRoster) {
      return [...leaders].sort(
        (a, b) =>
          (b.matches > 0 ? 1 : 0) - (a.matches > 0 ? 1 : 0) ||
          b.winRate - a.winRate ||
          a.leaderName.localeCompare(b.leaderName),
      )
    }
    return [...leaders].filter((l) => l.matches > 0).sort((a, b) => b.winRate - a.winRate).slice(0, 12)
  }, [leaders, mode, showFullRoster])
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const activeName = hovered || pinned
  const active = ranked.find((l) => l.leaderName === activeName) || null

  // Anchor the breakdown popover just under the focused cell, clamped to the
  // viewport. Rendered as a fixed overlay so it never pushes page content down.
  const anchorTo = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const W = typeof window !== 'undefined' ? window.innerWidth : 1024
    setAnchor({ left: Math.max(12, Math.min(r.left, W - 320)), top: r.bottom + 8 })
  }

  return (
    <section className={`your-stats-meta-card your-stats-wr--${mode}`}>
      <header className="your-stats-meta-card-header">
        <div>
          <span className="your-stats-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
      </header>
      {ranked.length === 0 ? (
        <p className="your-stats-meta-empty">
          {mode === 'meta'
            ? 'No captured games for this set across the site yet.'
            : detected
              // Has the plugin → functional copy regardless of the promo gate.
              ? (<>No captured games yet for this set. Queue your pools on Karabast and win rates fill in here.</>)
              : !companionBeta
                ? 'Coming soon — your win rate by leader will show up here.'
                : (<>No captured games yet for this set. Install the Wayfinder Companion and play your pool on Karabast to record games.</>)}
        </p>
      ) : (
        <>
          <p className="your-stats-meta-subtitle">Tap or hover a leader for win rate by base aspect.</p>
          <div className="your-stats-wr-grid" onMouseLeave={() => setHovered(null)}>
            {ranked.map((l) => {
              const art = l.leaderBackImageUrl || l.leaderImageUrl
              const isActive = activeName === l.leaderName
              const hasGames = l.matches > 0
              return (
                <button
                  key={l.leaderName}
                  type="button"
                  className={`your-stats-wr-cell${isActive ? ' is-active' : ''}`}
                  onMouseEnter={(e) => { setHovered(l.leaderName); anchorTo(e.currentTarget) }}
                  onFocus={(e) => { setHovered(l.leaderName); anchorTo(e.currentTarget) }}
                  onClick={(e) => { anchorTo(e.currentTarget); setPinned((cur) => (cur === l.leaderName ? null : l.leaderName)) }}
                  aria-label={hasGames
                    ? `${l.leaderName}: ${l.winRate.toFixed(0)}% win rate, ${recordLabel(l.wins, l.losses, l.draws) || ''} over ${matchesLabel(l.matches)}`
                    : `${l.leaderName}: no games yet`}
                  title={hasGames
                    ? `${l.leaderName} — ${l.winRate.toFixed(0)}%${recordLabel(l.wins, l.losses, l.draws) ? ` (${recordLabel(l.wins, l.losses, l.draws)})` : ''} · ${matchesLabel(l.matches)}`
                    : `${l.leaderName} — no games yet`}
                >
                  {art
                    ? <img className="your-stats-wr-cell-art" src={art} alt="" loading="lazy" />
                    : <span className="your-stats-wr-cell-art your-stats-wr-cell-art--empty" />}
                  <span className="your-stats-wr-cell-overlay">
                    {hasGames ? (
                      <>
                        <span className="your-stats-wr-cell-pct" style={{ color: winRateColor(l.winRate) }}>{l.winRate.toFixed(0)}%</span>
                        <span className="your-stats-wr-cell-games">{recordLabel(l.wins, l.losses, l.draws) || matchesLabel(l.matches)}</span>
                      </>
                    ) : (
                      <>
                        <span className="your-stats-wr-cell-pct your-stats-wr-cell-pct--empty">–</span>
                        <span className="your-stats-wr-cell-games">—</span>
                      </>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {active && anchor && (
            <div className="your-stats-wr-popover" role="dialog" aria-label={`${active.leaderName} win rate by base aspect`}
              style={{ position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 60 }}>
              <BaseBars leader={active} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default WinRateByLeader
