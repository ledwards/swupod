'use client'
import type { HubMatch, HubView } from '../../services/pods/hubTypes'
import { bracketRoundName, bracketSize } from '../../services/pods/tournament'
import { EyeIcon, OpenIcon } from './icons'
import { playHref, watchHref } from './RoundView'

interface Slot { name: string; score: string; won: boolean; bot?: boolean }
interface Cell { key: string; top: Slot; bottom: Slot; match: HubMatch | null }

const COL = 310, BOX = 230, ROW = 130, HEAD = 40
const singular = (name: string) => name === 'Quarterfinals' ? 'Quarterfinal' : name === 'Semifinals' ? 'Semifinal' : name

function sideName(match: HubMatch | null | undefined, previous: Cell | undefined): string {
  if (match) return '' // filled from the match itself
  if (!previous) return '—'
  const m = previous.match
  if (!m) return '—'
  if (m.status === 'bye') return m.p1.name
  if (m.winner === 'player1') return m.p1.name
  if (m.winner === 'player2') return m.p2!.name
  return `${m.p1.name} or ${m.p2!.name}`
}

/** Every bracket round, played or not; later rounds show who can still arrive. */
export function bracketColumns(view: HubView): { name: string; cells: Cell[] }[] {
  const t = view.tournament
  const elim = t?.rounds.filter(r => r.stage === 'elimination') ?? []
  const size = view.settings.format === 'swiss' ? view.settings.topCut : bracketSize(view.entrantCount)
  const columns: { name: string; cells: Cell[] }[] = []
  for (let matches = size / 2, r = 1; matches >= 1; matches /= 2, r++) {
    const round = elim.find(x => x.round === r)
    const prev = columns.at(-1)?.cells
    const cells: Cell[] = []
    for (let j = 0; j < matches; j++) {
      const m = round?.matches.find(x => x.table === j + 1) ?? null
      const slot = (side: 'p1' | 'p2', fallback: string): Slot => {
        if (!m) return { name: fallback, score: '', won: false }
        const s = side === 'p1' ? m.p1 : m.p2
        if (!s) return { name: 'Bye', score: '', won: false }
        const won = m.winner === (side === 'p1' ? 'player1' : 'player2')
        return { name: s.name, score: m.status === 'bye' ? '' : String(m.score[side === 'p1' ? 0 : 1]), won, bot: s.isBot }
      }
      cells.push({ key: `${r}-${j}`, match: m, top: slot('p1', sideName(m, prev?.[j * 2])), bottom: slot('p2', sideName(m, prev?.[j * 2 + 1])) })
    }
    columns.push({ name: bracketRoundName(matches), cells })
  }
  return columns
}

/** P7: the elimination bracket with Watch on live matches, and the viewer's next match. */
export default function BracketView({ view, shareId }: { view: HubView; shareId: string }) {
  const columns = bracketColumns(view)
  const first = columns[0]?.cells.length ?? 1
  const height = first * ROW
  const y = (c: number, j: number) => HEAD + (j + 0.5) * height / columns[c]!.cells.length
  const canWatch = (m: HubMatch | null) => !!m && m.live && m.status === 'playing' && !m.isYours && view.viewer.isPlayer
  const box = (cell: Cell) => <div className={`pod-bracket-box${cell.match?.isYours ? ' is-yours' : ''}`}>
    {[cell.top, cell.bottom].map((s, i) => <div key={i} className="pod-bracket-line">
      <span>{s.won ? <b>{s.name}</b> : s.name}</span><b className={s.won ? 'is-win' : ''}>{s.score}</b>
    </div>)}
    {canWatch(cell.match) && <a className="pod-bracket-watch" href={watchHref(shareId, cell.match!.id)} target="_blank" rel="noopener"><EyeIcon/> Watch</a>}
  </div>
  return <div className="pod-grid pod-grid--bracket">
    <div className="pod-bracket" style={{ width: (columns.length - 1) * COL + BOX, height: height + HEAD + 20 }} aria-label="Bracket" role="group">
      {columns.map((col, c) => <span key={`k${c}`} className="pod-k pod-bracket-name" style={{ left: c * COL }}>{col.name}</span>)}
      {columns.map((col, c) => col.cells.map((cell, j) => <div key={cell.key} className="pod-bracket-cell" style={{ left: c * COL, top: y(c, j) - 45 }}>{box(cell)}</div>))}
      {columns.slice(0, -1).map((col, c) => col.cells.map((_, j) => j % 2 ? null : <span key={`b${c}-${j}`}>
        <span className="pod-bracket-join" style={{ left: c * COL + BOX, top: y(c, j), height: y(c, j + 1) - y(c, j) }}/>
        <span className="pod-bracket-feed" style={{ left: c * COL + BOX + 45, top: (y(c, j) + y(c, j + 1)) / 2 - 1 }}/>
      </span>))}
    </div>
    <div className="pod-bracket-phone">
      {columns.map(col => <section key={col.name} aria-label={col.name}><span className="pod-k">{col.name}</span>{col.cells.map(cell => <div key={cell.key}>{box(cell)}</div>)}</section>)}
    </div>
    <aside className="pod-aside"><NextMatch view={view} shareId={shareId} columns={columns}/></aside>
  </div>
}

function NextMatch({ view, shareId, columns }: { view: HubView; shareId: string; columns: { name: string; cells: Cell[] }[] }) {
  const t = view.tournament
  const me = view.viewer.id
  if (!t || !me) return null
  if (t.status === 'complete') {
    const name = t.champion ? view.players.find(p => p.id === t.champion)?.name : null
    return name ? <section className="pod-pn pod-card"><span className="pod-k">Champion</span><b className="pod-big">{name}</b></section> : null
  }
  for (let c = 0; c < columns.length; c++) {
    const cells = columns[c]!.cells
    const j = cells.findIndex(cell => cell.match && cell.match.isYours)
    if (j < 0) continue
    const m = cells[j]!.match!
    if (m.status === 'playing') {
      const them = m.p1.isYou ? m.p2! : m.p1
      return <section className="pod-pn pod-card pod-yours"><span className="pod-k">Your match</span>
        <b className="pod-big">{singular(columns[c]!.name)} vs {them.name}</b>
        <a className="pod-go pod-go--link" href={playHref(shareId, m.id)} target="_blank" rel="noopener">{m.games.length || m.live ? 'Back to' : 'Play'} game {m.gameNumber} <OpenIcon/></a>
      </section>
    }
    const won = m.status === 'bye' || (m.winner === 'player1' ? m.p1.isYou : m.p2?.isYou)
    if (!won || c + 1 >= columns.length) continue
    const nextCell = columns[c + 1]!.cells[Math.floor(j / 2)]!
    if (nextCell.match) continue
    const sibling = cells[j % 2 ? j - 1 : j + 1]
    const opponent = sibling ? sideName(null, sibling) : '—'
    const live = sibling?.match && sibling.match.status === 'playing' ? sibling.match : null
    return <section className="pod-pn pod-card pod-yours"><span className="pod-k">Your next match</span>
      <b className="pod-big">{singular(columns[c + 1]!.name)} vs {opponent}</b>
      {live && <span className="pod-hint">Starts when Table {live.table} finishes</span>}
      {live?.live && view.viewer.isPlayer && <a className="pod-sec pod-sec--wide" href={watchHref(shareId, live.id)} target="_blank" rel="noopener"><EyeIcon/>Watch Table {live.table}</a>}
    </section>
  }
  return null
}
