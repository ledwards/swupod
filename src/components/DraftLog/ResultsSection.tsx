'use client'
import { useState } from 'react'
import Modal from '../Modal'
import StandingsView from '../PodHub/StandingsView'
import BracketView from '../PodHub/BracketView'
import { TrophyIcon } from '../PodHub/icons'
import type { HubView } from '../../services/pods/hubTypes'
import { seatMatches } from '../../services/draftLog/logModel'

/** One player's matches in the pod's tournament: a few lines, shown in their player card. */
export function PlayerResults({ hub, playerId }: { hub: HubView; playerId: string }) {
  const matches = seatMatches(hub, playerId)
  if (!hub.tournament || matches.length === 0) return null
  const word = { win: 'Won', loss: 'Lost', draw: 'Drew', playing: 'Playing', bye: 'Bye' }
  return <ul className="dlog-results-rows" aria-label="Results">
    {matches.map(m => <li key={m.key}>
      <span className="pod-hint">{m.label}</span>
      <b>{m.result === 'bye' ? 'Bye' : `vs ${m.opponent}`}</b>
      {m.games.length
        ? <span className="pod-strip" aria-label={`${word[m.result]} ${m.score}`}>{m.games.map((g, i) => <span key={i} className={`pod-game ${g === 'W' ? 'is-win' : g === 'L' ? 'is-loss' : 'is-draw'}`}>{g}</span>)}</span>
        : <span className="pod-hint">{m.result === 'bye' ? '' : m.result === 'playing' ? 'Playing' : `${word[m.result]} ${m.score}`}</span>}
    </li>)}
  </ul>
}

/** The pod's whole event: Swiss standings and/or the bracket, opened from the trophy in the toolbar. */
export function EventSummaryButton({ hub, shareId }: { hub: HubView; shareId: string }) {
  const [open, setOpen] = useState(false)
  const rounds = hub.tournament?.rounds ?? []
  const swiss = rounds.some(r => r.stage === 'swiss')
  const bracket = rounds.some(r => r.stage === 'elimination')
  if (!hub.tournament || (!swiss && !bracket)) return null
  const title = swiss && bracket ? 'Swiss and top cut' : swiss ? 'Swiss standings' : 'Bracket'
  return <>
    <button type="button" className="pod-ic" aria-label={title} title={title} aria-haspopup="dialog" onClick={() => setOpen(true)}><TrophyIcon/></button>
    {open && <Modal isOpen onClose={() => setOpen(false)} title={title} variant="wide" showCloseButton className="dlog-summary">
      <Modal.Body>
        {swiss && <StandingsView view={hub}/>}
        {bracket && <BracketView view={hub} shareId={shareId}/>}
      </Modal.Body>
    </Modal>}
  </>
}
