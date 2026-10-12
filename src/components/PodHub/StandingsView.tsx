import { useState } from 'react'
import type { HubView } from '../../services/pods/hubTypes'
import DeckArt, { LeaderFace } from './DeckArt'
import DeckEyeButton from '../DeckEyeButton'
import PlayerDeckImage from '../PlayerDeckImage'

/** P6: Swiss standings; the champion across the top once the last round is done. */
export default function StandingsView({ view }: { view: HubView }) {
  const t = view.tournament!
  const [viewing, setViewing] = useState<{ poolShareId: string; name: string } | null>(null)
  const playerOf = (id: string) => view.players.find(p => p.id === id)
  const champ = t.status === 'complete' && t.champion ? t.standings.find(s => s.id === t.champion) ?? null : null
  const champName = champ?.name ?? (t.status === 'complete' && t.champion ? playerOf(t.champion)?.name : null)
  return <div className="pod-grid pod-grid--standings">
    {champName && <section className="pod-champion" aria-label="Champion">
      <DeckArt deck={playerOf(t.champion!)?.deck ?? null}/><span className="pod-champion-scrim"/>
      <div className="pod-champion-text">
        <span className="pod-k">Champion</span>
        <b>{champName}</b>
        {champ && <span className="pod-champion-record">{champ.record.replace(/-/g, '–')}</span>}
      </div>
    </section>}
    <section className="pod-pn pod-standings" aria-label="Standings">
      <table>
        <thead><tr><th><span className="pod-visually-hidden">Rank</span></th><th className="pod-k">Player</th><th className="pod-k pod-num">Pts</th><th className="pod-k pod-num">Record</th><th className="pod-k pod-num">OMW</th></tr></thead>
        <tbody>
          {t.standings.map(s => {
            const p = playerOf(s.id)
            const pool = p?.deckPoolShareId ?? null
            return <tr key={s.id} className={s.isYou ? 'is-you' : undefined}>
              <td className="pod-rank">{s.rank}</td>
              <td className="pod-player-td"><span className="pod-player">
                <LeaderFace deck={p?.deck ?? null}/>
                <b>{s.name}</b>{s.isBot && <span className="pod-bot">AI</span>}
                {pool && <DeckEyeButton name={s.name} onClick={() => setViewing({ poolShareId: pool, name: s.name })}/>}
              </span></td>
              <td className="pod-num"><b>{s.points}</b></td>
              <td className="pod-num">{s.record}</td>
              <td className="pod-num">{Math.round(s.omw * 100)}%</td>
            </tr>
          })}
        </tbody>
      </table>
    </section>
    {viewing && <PlayerDeckImage poolShareId={viewing.poolShareId} username={viewing.name} onClose={() => setViewing(null)}/>}
  </div>
}
