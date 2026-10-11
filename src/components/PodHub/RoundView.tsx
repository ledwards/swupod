'use client'
import { useState } from 'react'
import type { HubMatch, HubRound, HubSide, HubView } from '../../services/pods/hubTypes'
import DeckArt from './DeckArt'
import FixResult from './FixResult'
import { EyeIcon, OpenIcon } from './icons'

export const playHref = (shareId: string, matchId: string) => `/draft/${encodeURIComponent(shareId)}/pod/play/${matchId}`
export const watchHref = (shareId: string, matchId: string) => `${playHref(shareId, matchId)}?watch=1`

export function scoreText(m: HubMatch) { return `${m.score[0]}–${m.score[1]}` }
export function statusText(m: HubMatch) {
  if (m.status === 'bye') return 'Bye'
  if (m.status === 'finished') return 'Finished'
  return `Game ${m.gameNumber ?? 1}`
}

const Name = ({ side }: { side: HubSide }) => <><b>{side.name}</b>{side.isBot && <span className="pod-bot">AI</span>}</>

/** P4: a Swiss round in progress. Pairings by table, your match on the right. */
export default function RoundView({ view, round, shareId, onChanged }: { view: HubView; round: HubRound; shareId: string; onChanged: () => void }) {
  const [fixing, setFixing] = useState(false)
  const finished = round.matches.filter(m => m.status !== 'playing').length
  const tables = round.matches.filter(m => m.status !== 'bye')
  const mine = round.matches.find(m => m.isYours)
  const lastSwiss = round.round >= view.settings.rounds
  const roundOpen = round.matches.some(m => m.status === 'playing')
  const next = !roundOpen ? '' : !lastSwiss ? ` Round ${round.round + 1} pairs when every table finishes.` : ' Final standings post when every table finishes.'
  const action = (m: HubMatch) => {
    if (m.status !== 'playing' || view.legacy) return null
    if (m.isYours) return <a className="pod-go pod-go--row" href={playHref(shareId, m.id)} target="_blank" rel="noopener" aria-disabled={!view.nativePlay}>Play <OpenIcon/></a>
    if (m.live && view.viewer.isPlayer) return <a className="pod-sec pod-sec--row" href={watchHref(shareId, m.id)} target="_blank" rel="noopener"><EyeIcon/>Watch</a>
    return null
  }
  return <div className="pod-grid pod-grid--round">
    <section className="pod-pn pod-pairings" aria-label="Pairings">
      <div className="pod-pairings-head"><span className="pod-k">Round {round.round} · Tables</span><span className="pod-hint">{finished} of {round.matches.length} finished</span></div>
      <div className="pod-pairings-rows">
        {round.matches.map(m => <div key={m.id} className={`pod-pair${m.isYours ? ' is-yours' : ''}`}>
          <span className="pod-table-no">{m.status === 'bye' ? '–' : m.table}</span>
          <span><Name side={m.p1}/> <span className="pod-hint">{m.p1.points} pts</span></span>
          <b className="pod-score">{m.status === 'bye' ? '' : scoreText(m)}</b>
          <span className="pod-right">{m.p2 ? <><Name side={m.p2}/> <span className="pod-hint">{m.p2.points} pts</span></> : null}</span>
          <span className={`pod-hint pod-right${m.status === 'playing' && m.isYours ? ' is-now' : ''}`}>{statusText(m)}</span>
          <span className="pod-right">{action(m)}</span>
        </div>)}
      </div>
      <ul className="pod-pairings-compact" aria-label="Other tables">
        {round.matches.filter(m => !m.isYours).map(m => <li key={m.id}>
          <span><b>{m.status === 'bye' ? '–' : m.table}</b>&nbsp; {m.p1.name} {m.p2 ? `${scoreText(m)} ${m.p2.name}` : ''}</span>
          {m.status === 'playing' && m.live && view.viewer.isPlayer
            ? <a className="pod-sec pod-sec--compact" href={watchHref(shareId, m.id)} target="_blank" rel="noopener"><EyeIcon/>Watch</a>
            : <span className="pod-hint">{statusText(m)}</span>}
        </li>)}
      </ul>
      <div className="pod-pairings-foot">
        <span className="pod-hint">{view.legacy ? 'Results as reported in Swiss Practice.' : `Results come from the games.${next}`}</span>
        {view.viewer.isHost && !view.legacy && tables.length > 0 && <button type="button" className="pod-sec pod-sec--small" onClick={() => setFixing(true)}>Fix a result</button>}
      </div>
    </section>
    {mine && <aside className="pod-aside"><YourMatch view={view} match={mine} shareId={shareId} label={`Round ${round.round} of ${view.settings.rounds}`}/></aside>}
    {fixing && <FixResult shareId={shareId} matches={tables} bestOf={view.settings.bestOf} stage="swiss" onClose={() => setFixing(false)} onChanged={onChanged}/>}
  </div>
}

export function matchLead(m: HubMatch, mySide: 0 | 1) {
  const [a, b] = mySide === 0 ? m.score : [m.score[1], m.score[0]]
  if (m.status === 'finished') return m.winner === 'draw' ? `Drew ${a}–${b}` : (m.winner === (mySide === 0 ? 'player1' : 'player2') ? `Won ${a}–${b}` : `Lost ${a}–${b}`)
  return a > b ? `Up ${a}–${b}` : a < b ? `Down ${a}–${b}` : a ? `Level ${a}–${b}` : ''
}

/** The viewer's match: both decks, a game-by-game strip and a way back to the table. */
export function YourMatch({ view, match: m, shareId, label }: { view: HubView; match: HubMatch; shareId: string; label: string }) {
  if (m.status === 'bye') return <section className="pod-pn pod-card pod-yours" aria-label="Your match">
    <div className="pod-section-head"><span className="pod-k">Your match</span><span className="pod-hint">{label}</span></div>
    <b className="pod-big">Bye</b><span className="pod-hint">You win this round.</span>
  </section>
  const mySide: 0 | 1 = m.p1.isYou ? 0 : 1
  const me = mySide === 0 ? m.p1 : m.p2!, them = mySide === 0 ? m.p2! : m.p1
  const slots = Math.max(view.settings.bestOf, m.games.length + (m.status === 'playing' ? 1 : 0))
  const lead = matchLead(m, mySide)
  const started = m.games.length > 0 || m.live
  return <section className="pod-pn pod-card pod-yours" aria-label="Your match">
    <div className="pod-section-head"><span className="pod-k">Your match · Table {m.table}</span><span className="pod-hint">{label}</span></div>
    <span className="pod-phone-head"><span className="pod-k">Table {m.table} · vs {them.name}</span>{lead && <span className="pod-hint">{lead}</span>}</span>
    <div className="pod-versus">
      <div className="pod-deck-banner pod-deck-banner--small"><DeckArt deck={me.deck}/><span className="pod-shade"/><b>{me.name}</b></div>
      <span className="pod-hint pod-vs">vs</span>
      <div className="pod-deck-banner pod-deck-banner--small"><DeckArt deck={them.deck}/><span className="pod-shade"/><b>{them.name}</b></div>
    </div>
    <div className="pod-strip">
      {Array.from({ length: slots }, (_, i) => {
        const g = m.games[i]
        if (g) {
          const won = g === (mySide === 0 ? 'player1' : 'player2')
          return <span key={i} className={`pod-game ${g === 'draw' ? 'is-draw' : won ? 'is-win' : 'is-loss'}`} aria-label={`Game ${i + 1}: ${g === 'draw' ? 'draw' : won ? 'won' : 'lost'}`}>{g === 'draw' ? 'D' : won ? 'W' : 'L'}</span>
        }
        const now = m.status === 'playing' && i === m.games.length
        return <span key={i} className={`pod-game ${now ? 'is-now' : 'is-later'}`} aria-label={`Game ${i + 1}`}>{i + 1}</span>
      })}
      {lead && <span className="pod-hint pod-strip-lead">{lead}</span>}
    </div>
    {m.status === 'playing' && !view.legacy && <>
      <a className="pod-go pod-go--link" href={playHref(shareId, m.id)} target="_blank" rel="noopener" aria-disabled={!view.nativePlay}>{started ? 'Back to' : 'Play'} game {m.gameNumber} <OpenIcon/></a>
      <span className="pod-hint pod-center pod-desktop-only">Opens your table in a new tab</span>
    </>}
  </section>
}
