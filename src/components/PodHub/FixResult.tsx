'use client'
import { useState } from 'react'
import type { HubMatch } from '../../services/pods/hubTypes'
import Sheet from './Sheet'

/** Scores a host can set: Bo3 2–0 2–1 1–2 0–2 (and 1–1 in Swiss); Bo1 1–0 0–1 (and a draw in Swiss). */
export function fixScores(bestOf: 1 | 3, stage: 'swiss' | 'elimination'): [number, number][] {
  const list: [number, number][] = bestOf === 1 ? [[1, 0], [0, 1]] : [[2, 0], [2, 1], [1, 2], [0, 2]]
  if (stage === 'swiss') list.push(bestOf === 1 ? [0, 0] : [1, 1])
  return list
}

/** Host only: the result the games would have reported, set by hand. */
export default function FixResult({ shareId, matches, bestOf, stage, onClose, onChanged }: {
  shareId: string; matches: HubMatch[]; bestOf: 1 | 3; stage: 'swiss' | 'elimination'; onClose: () => void; onChanged: () => void
}) {
  const [matchId, setMatchId] = useState(matches.find(m => m.status === 'playing')?.id ?? matches[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const match = matches.find(m => m.id === matchId)
  const save = async (score: [number, number]) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/match/${matchId}/override`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player1Wins: score[0], player2Wins: score[1] }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) { setError(body?.error ?? 'The result could not be saved.'); return }
      onChanged(); onClose()
    } finally { setBusy(false) }
  }
  return <Sheet title="Fix a result" onClose={onClose} narrow>
    <div className="pod-row"><b>Table</b>
      <div className="pod-seg">{matches.map(m => <button key={m.id} type="button" aria-pressed={m.id === matchId} onClick={() => setMatchId(m.id)}>{m.table}</button>)}</div>
    </div>
    {match?.p2 && <div className="pod-row"><b>Result</b>
      <div className="pod-seg pod-seg--wrap">
        {fixScores(bestOf, stage).map(([a, b]) => <button key={`${a}-${b}`} type="button" disabled={busy} onClick={() => void save([a, b])}>
          {a === b ? 'Draw' : `${a > b ? match.p1.name : match.p2!.name} ${Math.max(a, b)}–${Math.min(a, b)}`}
        </button>)}
      </div>
    </div>}
    {match && <p className="pod-hint">{match.p1.name} vs {match.p2?.name}. This replaces what the games reported.</p>}
    {error && <p className="pod-hint" role="alert">{error}</p>}
  </Sheet>
}
