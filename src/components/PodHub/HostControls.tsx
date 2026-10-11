'use client'
import { useRef, useState } from 'react'
import type { HubView } from '../../services/pods/hubTypes'
import { maxRounds, recommendedRounds, type TournamentSettings } from '../../services/pods/tournament'
import { AFTER_DRAFT_CHOICES } from './afterDraftChoices'
import { listNames } from './PodHub'

/**
 * The host card: tournament settings inline, saved as they are made, with Start Round 1 below.
 * Settings lock once Round 1 starts; "Decks and pools public" can change at any time.
 */
export default function HostControls({ view, shareId, onChanged }: { view: HubView; shareId: string; onChanged: () => void }) {
  const [s, setS] = useState<TournamentSettings>(view.settings)
  const [decksPublic, setDecksPublic] = useState(view.decksPublic)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const locked = !!view.tournament
  const humans = view.players.filter(p => !p.isBot).length
  const bots = view.players.filter(p => p.isBot).length
  const entrants = humans + (s.botsPlay ? bots : 0)
  const recommended = recommendedRounds(entrants)
  const waiting = view.players.filter(p => !p.isReady && !p.isBot).map(p => p.name)
  const update = (patch: Partial<TournamentSettings>) => {
    const next = { ...s, ...patch }
    const count = humans + (next.botsPlay ? bots : 0)
    if (patch.botsPlay !== undefined) next.rounds = recommendedRounds(count)
    next.rounds = Math.max(1, Math.min(next.rounds, maxRounds(count)))
    setS(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/settings`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
        .then(r => { if (r.ok) onChanged() })
    }, 250)
  }
  const togglePublic = (value: boolean) => {
    setDecksPublic(value)
    void fetch(`/api/draft/${encodeURIComponent(shareId)}/decks-public`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decksPublic: value }) })
      .then(r => { if (r.ok) onChanged(); else setDecksPublic(!value) })
  }
  const start = async () => {
    clearTimeout(saveTimer.current)
    setStarting(true); setError('')
    try {
      const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/start`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) })
      const body = await response.json().catch(() => null)
      if (!response.ok) setError(body?.error ?? 'Round 1 could not start.')
      else onChanged()
    } finally { setStarting(false) }
  }
  return <section className="pod-pn pod-card pod-host" aria-label="Host">
    <span className="pod-k">Host</span>
    <fieldset className="pod-fieldset pod-host-fields" disabled={locked}>
      <div className="pod-host-row"><b>Format</b>
        <div className="pod-seg pod-after-draft">
          {AFTER_DRAFT_CHOICES.map(choice => (
            <button key={choice.value} type="button" aria-pressed={s.format === choice.value} onClick={() => update({ format: choice.value })}>
              {choice.icon}<span>{choice.label}</span>
            </button>
          ))}
        </div>
      </div>
      {s.format === 'swiss' && <div className="pod-host-row"><b>Rounds</b>
        <div className="pod-stepper-line">
          <div className="pod-stepper">
            <button type="button" aria-label="Fewer" disabled={s.rounds <= 1} onClick={() => update({ rounds: s.rounds - 1 })}>−</button>
            <span aria-live="polite">{s.rounds}</span>
            <button type="button" aria-label="More" disabled={s.rounds >= maxRounds(entrants)} onClick={() => update({ rounds: s.rounds + 1 })}>+</button>
          </div>
          {s.rounds === recommended && <span className="pod-hint">Recommended for {entrants}</span>}
        </div>
      </div>}
      {s.format !== 'none' && <div className="pod-host-row"><b>Matches</b>
        <div className="pod-seg">
          <button type="button" aria-pressed={s.bestOf === 1} onClick={() => update({ bestOf: 1 })}>Best of 1</button>
          <button type="button" aria-pressed={s.bestOf === 3} onClick={() => update({ bestOf: 3 })}>Best of 3</button>
        </div>
      </div>}
      {bots > 0 && s.format !== 'none' && <label className="pod-toggle">
        <input type="checkbox" checked={s.botsPlay} onChange={e => update({ botsPlay: e.target.checked })}/>
        <span className="pod-switch" aria-hidden="true"><i/></span>
        <span>Bots play their decks</span>
        <span className="pod-hint">Seat{view.botSeats.length === 1 ? '' : 's'} {listNames(view.botSeats.map(String))}</span>
      </label>}
    </fieldset>
    <label className="pod-toggle">
      <input type="checkbox" checked={decksPublic} onChange={e => togglePublic(e.target.checked)}/>
      <span className="pod-switch" aria-hidden="true"><i/></span>
      <span>Decks and pools public</span>
    </label>
    {locked ? <span className="pod-hint pod-center">Settings lock once Round 1 starts</span>
      : s.format !== 'none' && <>
        <button type="button" className="pod-go" disabled={starting} onClick={() => void start()}>Start Round 1</button>
        {error ? <span className="pod-hint pod-center" role="alert">{error}</span>
          : waiting.length > 0 && <span className="pod-hint pod-center">Waiting on {listNames(waiting)}</span>}
      </>}
  </section>
}
