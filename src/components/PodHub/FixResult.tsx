'use client'
import { useEffect, useRef, useState } from 'react'
import type { GameResult } from '../../services/pods/tournament'
import type { HubMatch } from '../../services/pods/hubTypes'

/** Games won by each player and games drawn, as the host enters them. */
export interface Tally { p1: number; p2: number; draws: number }

const needOf = (bestOf: 1 | 3) => (bestOf === 1 ? 1 : 2)

/** The tally the games reported so far, kept inside the steppers' bounds. */
export function tallyOf(games: readonly GameResult[], bestOf: 1 | 3): Tally {
  const count = (r: GameResult) => games.filter(g => g === r).length
  const need = needOf(bestOf)
  return { p1: Math.min(count('player1'), need), p2: Math.min(count('player2'), need), draws: Math.min(count('draw'), bestOf) }
}

/**
 * The final result a tally describes, or null when it is not one. A match is
 * decided when one player reaches the wins it needs (no draws counted then);
 * otherwise, in Swiss only, every game is accounted for and the side with more
 * wins takes it, or it is a draw. This is exactly what the override stores.
 */
export function tallyResult(t: Tally, bestOf: 1 | 3, stage: 'swiss' | 'elimination'): { player1Wins: number; player2Wins: number; winner: 'player1' | 'player2' | 'draw' } | null {
  const need = needOf(bestOf)
  if (t.p1 > need || t.p2 > need || t.draws > bestOf || (t.p1 === need && t.p2 === need)) return null
  if (t.p1 === need || t.p2 === need) return t.draws ? null : { player1Wins: t.p1, player2Wins: t.p2, winner: t.p1 === need ? 'player1' : 'player2' }
  if (stage === 'elimination' || t.p1 + t.p2 + t.draws !== bestOf) return null
  return { player1Wins: t.p1, player2Wins: t.p2, winner: t.p1 > t.p2 ? 'player1' : t.p2 > t.p1 ? 'player2' : 'draw' }
}

/** "terronk wins 2–1", "Draw", or why Submit is off. */
export function tallyPreview(t: Tally, bestOf: 1 | 3, stage: 'swiss' | 'elimination', names: [string, string]): string {
  const r = tallyResult(t, bestOf, stage)
  if (!r) return stage === 'elimination' ? 'Needs a winner' : 'Not a final score'
  if (r.winner === 'draw') return 'Draw'
  const [hi, lo] = r.winner === 'player1' ? [t.p1, t.p2] : [t.p2, t.p1]
  return `${names[r.winner === 'player1' ? 0 : 1]} wins ${hi}–${lo}${t.draws ? `–${t.draws}` : ''}`
}

function Counter({ label, value, max, onChange, bot }: { label: string; value: number; max: number; onChange: (v: number) => void; bot?: boolean }) {
  return <div className="pod-tally-row">
    <span className="pod-tally-name"><b>{label}</b>{bot && <span className="pod-bot">AI</span>}</span>
    <span className="pod-tally-step">
      <button type="button" className="pod-step-btn" aria-label={`${label}: one less`} disabled={value <= 0} onClick={() => onChange(value - 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button>
      <output aria-label={label}>{value}</output>
      <button type="button" className="pod-step-btn" aria-label={`${label}: one more`} disabled={value >= max} onClick={() => onChange(value + 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></button>
    </span>
  </div>
}

/** Host only: the accordion under a table row that sets its result by hand, melee-style. */
export default function FixResult({ shareId, match, bestOf, onClose, onChanged }: {
  shareId: string; match: HubMatch; bestOf: 1 | 3; onClose: () => void; onChanged: () => void
}) {
  const [tally, setTally] = useState(() => tallyOf(match.games, bestOf))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])
  const result = tallyResult(tally, bestOf, match.stage)
  const names: [string, string] = [match.p1.name, match.p2?.name ?? '']
  const save = async () => {
    if (!result) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/match/${match.id}/override`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ player1Wins: result.player1Wins, player2Wins: result.player2Wins }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) { setError(body?.error ?? 'The result could not be saved.'); return }
      onChanged(); onClose()
    } catch { setError('The result could not be saved.') } finally { setBusy(false) }
  }
  const need = needOf(bestOf)
  return <div ref={ref} className="pod-fix" role="group" aria-label={`Fix table ${match.table}`} tabIndex={-1}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
    <div className="pod-tally">
      <Counter label={names[0]} bot={match.p1.isBot} value={tally.p1} max={need} onChange={p1 => setTally({ ...tally, p1 })}/>
      <Counter label={names[1]} bot={!!match.p2?.isBot} value={tally.p2} max={need} onChange={p2 => setTally({ ...tally, p2 })}/>
      <Counter label="Draws" value={tally.draws} max={bestOf} onChange={draws => setTally({ ...tally, draws })}/>
    </div>
    <div className="pod-fix-foot">
      <output className={`pod-fix-preview${result ? '' : ' is-off'}`} aria-live="polite">{tallyPreview(tally, bestOf, match.stage, names)}</output>
      <button type="button" className="pod-quiet" onClick={onClose}>Cancel</button>
      <button type="button" className="pod-go pod-go--row" disabled={!result || busy} aria-busy={busy} onClick={() => void save()}>Submit</button>
    </div>
    {error && <p className="pod-hint pod-fix-error" role="alert">{error}</p>}
  </div>
}
