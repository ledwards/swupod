import type { HubView } from '../../services/pods/hubTypes'
import { LeaderFace } from './DeckArt'

/** P6: Swiss standings; the champion once the last round is done. */
export default function StandingsView({ view }: { view: HubView }) {
  const t = view.tournament!
  const champion = t.champion ? t.standings.find(s => s.id === t.champion)?.name ?? view.players.find(p => p.id === t.champion)?.name : null
  return <div className="pod-grid pod-grid--standings">
    <section className="pod-pn pod-standings" aria-label="Standings">
      <table>
        <thead><tr><th><span className="pod-visually-hidden">Rank</span></th><th className="pod-k">Player</th><th className="pod-k pod-num">Pts</th><th className="pod-k pod-num">Record</th><th className="pod-k pod-num">OMW</th></tr></thead>
        <tbody>
          {t.standings.map(s => {
            const deck = view.players.find(p => p.id === s.id)?.deck ?? null
            return <tr key={s.id} className={s.isYou ? 'is-you' : undefined}>
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
      {t.status === 'complete' && champion && <section className="pod-pn pod-card"><span className="pod-k">Champion</span><b className="pod-big">{champion}</b></section>}
    </aside>
  </div>
}
