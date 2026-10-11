'use client'
import { useRef, useState } from 'react'
import type { HubView } from '../../services/pods/hubTypes'
import { maxRounds, recommendedRounds, type TournamentSettings } from '../../services/pods/tournament'
import Sheet from './Sheet'
import { LeaderFace } from './DeckArt'
import { CheckIcon } from './icons'
import { AFTER_DRAFT_CHOICES } from './afterDraftChoices'
import { listNames } from './PodHub'

/** P2, host only: tournament settings before Round 1. Changes save as they are made. */
export default function EventSettings({ view, shareId, onClose, onChanged }: { view: HubView; shareId: string; onClose: () => void; onChanged: () => void }) {
  const [s, setS] = useState<TournamentSettings>(view.settings)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const locked = !!view.tournament
  const humans = view.players.filter(p => !p.isBot).length
  const bots = view.players.filter(p => p.isBot).length
  const entrants = humans + (s.botsPlay ? bots : 0)
  const recommended = recommendedRounds(entrants)
  const update = (patch: Partial<TournamentSettings>) => {
    const next = { ...s, ...patch }
    const count = humans + (next.botsPlay ? bots : 0)
    if (patch.botsPlay !== undefined) next.rounds = recommendedRounds(count)
    next.rounds = Math.max(1, Math.min(next.rounds, maxRounds(count)))
    if (next.format !== 'swiss' || next.topCut > count) next.topCut = 0
    setS(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/settings`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
        .then(r => { if (r.ok) onChanged() })
    }, 250)
  }
  const start = async () => {
    clearTimeout(saveTimer.current)
    setStarting(true); setError('')
    try {
      if (s.format === 'none') {
        const r = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/settings`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) })
        if (r.ok) { onChanged(); onClose() } else setError('Settings could not be saved.')
        return
      }
      const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/start`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) })
      const body = await response.json().catch(() => null)
      if (!response.ok) { setError(body?.error ?? 'Round 1 could not start.'); return }
      onChanged(); onClose()
    } finally { setStarting(false) }
  }
  const ready = view.players.filter(p => p.isReady)
  const notReady = view.players.filter(p => !p.isReady)
  // Who is still building always shows; ready decks fill the rest of five.
  const shown = [...ready.slice(0, Math.max(0, 5 - notReady.length)), ...notReady.slice(0, 5)].sort((a, b) => a.seat - b.seat)
  const more = view.players.length - shown.length
  const moreReady = ready.length - shown.filter(p => p.isReady).length
  const aside = <>
    <section className="pod-pn pod-decks-in">
      <div className="pod-section-head"><span className="pod-k">Decks in</span><b>{ready.length} / {view.players.length}</b></div>
      {shown.map(p => <div key={p.id} className={`pod-deck-line${p.isReady ? '' : ' is-building'}`}>
        {p.isReady ? <LeaderFace deck={p.deck}/> : <span className="pod-face is-empty"/>}
        <b>{p.name}{p.isBot && <span className="pod-bot">AI</span>}</b>
        {p.isReady ? <span className="pod-ok" role="img" aria-label="Ready"><CheckIcon/></span> : <span className="pod-hint">Building</span>}
      </div>)}
      {more > 0 && <div className="pod-hint pod-more">+{more} more{moreReady === more ? ' ready' : ''}</div>}
    </section>
    {locked ? <span className="pod-hint pod-center">Settings lock once Round 1 starts</span> : <>
    <button type="button" className="pod-go" disabled={starting} onClick={() => void start()}>{s.format === 'none' ? 'Save' : 'Start Round 1'}</button>
    {error ? <span className="pod-hint pod-center" role="alert">{error}</span>
      : s.format !== 'none' && <span className="pod-hint pod-center">Later rounds start on their own</span>}
    </>}
  </>
  return <Sheet title="Tournament" onClose={onClose} aside={aside}>
    <fieldset className="pod-fieldset" disabled={locked}>
    <div className="pod-row"><b>Format</b>
      <div className="pod-seg pod-after-draft">
        {AFTER_DRAFT_CHOICES.map(choice => (
          <button key={choice.value} type="button" aria-pressed={s.format === choice.value}
            onClick={() => update(choice.value === 'swiss' ? { format: 'swiss', topCut: s.topCut || (entrants >= 6 ? 4 : 0) } : { format: choice.value })}>
            {choice.icon}<span>{choice.label}</span>
          </button>
        ))}
      </div>
    </div>
    {s.format === 'swiss' && <div className="pod-row"><b>Rounds</b>
      <div className="pod-stepper-line">
        <div className="pod-stepper">
          <button type="button" aria-label="Fewer" disabled={s.rounds <= 1} onClick={() => update({ rounds: s.rounds - 1 })}>−</button>
          <span aria-live="polite">{s.rounds}</span>
          <button type="button" aria-label="More" disabled={s.rounds >= maxRounds(entrants)} onClick={() => update({ rounds: s.rounds + 1 })}>+</button>
        </div>
        {s.rounds === recommended && <span className="pod-hint">Recommended for {entrants}</span>}
      </div>
    </div>}
    {s.format !== 'none' && <div className="pod-row"><b>Matches</b>
      <div className="pod-seg">
        <button type="button" aria-pressed={s.bestOf === 1} onClick={() => update({ bestOf: 1 })}>Best of 1</button>
        <button type="button" aria-pressed={s.bestOf === 3} onClick={() => update({ bestOf: 3 })}>Best of 3</button>
      </div>
    </div>}
    {s.format === 'swiss' && <div className="pod-row"><b>Top cut</b>
      <div className="pod-seg">
        <button type="button" aria-pressed={s.topCut === 0} onClick={() => update({ topCut: 0 })}>None</button>
        <button type="button" aria-pressed={s.topCut === 4} disabled={entrants < 4} onClick={() => update({ topCut: 4 })}>Top 4</button>
        <button type="button" aria-pressed={s.topCut === 8} disabled={entrants < 8} onClick={() => update({ topCut: 8 })}>Top 8</button>
      </div>
    </div>}
    {bots > 0 && s.format !== 'none' && <div className="pod-row"><b>Bot seats</b>
      <label className="pod-toggle">
        <input type="checkbox" checked={s.botsPlay} onChange={e => update({ botsPlay: e.target.checked })}/>
        <span className="pod-switch" aria-hidden="true"><i/></span>
        <span>Bots play their decks</span>
        <span className="pod-hint">Seat{view.botSeats.length === 1 ? '' : 's'} {listNames(view.botSeats.map(String))}</span>
      </label>
    </div>}
    </fieldset>
  </Sheet>
}
