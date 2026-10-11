'use client'
import { useEffect } from 'react'
import type { HubView } from '../../services/pods/hubTypes'
import { bracketRoundName, bracketSeedOrder } from '../../services/pods/tournament'
import { LeaderFace } from './DeckArt'
import { useNow } from './PodHub'

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

/** "Semifinals pair 1 v 4 and 2 v 3" / "Quarterfinals pair 1 v 8, 4 v 5, 2 v 7 and 3 v 6". */
export function cutPairsText(cut: number) {
  const order = bracketSeedOrder(cut)
  const pairs: string[] = []
  for (let i = 0; i < order.length; i += 2) pairs.push(`${order[i]} v ${order[i + 1]}`)
  const list = pairs.length > 1 ? `${pairs.slice(0, -1).join(', ')} and ${pairs.at(-1)}` : pairs[0]
  return `${bracketRoundName(cut / 2)} pair ${list}`
}

/** P6: Swiss standings with the cut line; after Swiss, the top cut counts down and starts on its own. */
export default function StandingsView({ view, fetchedAt, onDue }: { view: HubView; fetchedAt: number; onDue: () => void }) {
  const t = view.tournament!
  const now = useNow()
  const serverNow = view.serverNow + (now - fetchedAt)
  const remaining = t.cutStartsAt !== null ? t.cutStartsAt - serverNow : null
  const counting = remaining !== null && !t.rounds.some(r => r.stage === 'elimination')
  useEffect(() => { if (counting && remaining !== null && remaining <= 0) onDue() }, [counting, remaining !== null && remaining <= 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const cut = view.settings.topCut
  const champion = t.champion ? t.standings.find(s => s.id === t.champion)?.name ?? view.players.find(p => p.id === t.champion)?.name : null
  return <div className="pod-grid pod-grid--standings">
    <section className="pod-pn pod-standings" aria-label="Standings">
      <table>
        <thead><tr><th><span className="pod-visually-hidden">Rank</span></th><th className="pod-k">Player</th><th className="pod-k pod-num">Pts</th><th className="pod-k pod-num">Record</th><th className="pod-k pod-num">OMW</th></tr></thead>
        <tbody>
          {t.standings.map(s => {
            const deck = view.players.find(p => p.id === s.id)?.deck ?? null
            return <tr key={s.id} className={`${s.isYou ? 'is-you' : ''}${cut && s.rank === cut + 1 ? ' is-cut' : ''}`}>
              <td className="pod-rank">{s.rank}</td>
              <td><LeaderFace deck={deck}/><b>{s.name}</b>{s.isBot && <span className="pod-bot">AI</span>}</td>
              <td className="pod-num"><b>{s.points}</b></td>
              <td className="pod-num">{s.record}</td>
              <td className="pod-num">{Math.round(s.omw * 100)}%</td>
            </tr>
          })}
        </tbody>
      </table>
    </section>
    <aside className="pod-aside">
      {t.status === 'complete' && champion ? <section className="pod-pn pod-card"><span className="pod-k">Champion</span><b className="pod-big">{champion}</b></section>
        : counting ? <section className="pod-pn pod-card">
          <span className="pod-k">Swiss complete</span>
          <b className="pod-big">Top {cut} starts in {clock(remaining!)}</b>
          <span className="pod-hint">{cutPairsText(cut)}</span>
        </section>
        : cut ? <section className="pod-pn pod-card"><span className="pod-k">Top {cut}</span><span className="pod-hint">The top {cut} play on after Round {view.settings.rounds}.</span></section>
        : null}
    </aside>
  </div>
}
