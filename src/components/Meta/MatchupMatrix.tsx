'use client'

import type { MatchupCell } from '@/src/services/meta/leaderMatchups'
import { MetaArt, MetaEmpty } from './MetaBits'

export interface MatchupData {
  leaders: string[]
  identifiedMatches: number
  leaderImages: (string | null)[]
  grid: (MatchupCell | null)[][]
  minMatches: number
}

/** Tint strength grows with distance from 50%; success above, danger below. */
function cellStyle(cell: MatchupCell | null) {
  if (!cell || cell.winRate == null) return undefined
  const strength = Math.round(Math.min(Math.abs(cell.winRate - 50) / 15, 1) * 50 + 10)
  const role = cell.winRate >= 50 ? '--theme-success' : '--theme-danger'
  return { background: `color-mix(in srgb, var(${role}) ${strength}%, transparent)` }
}

/** Row leader's win rate against each column leader. */
export function MatchupMatrix({ data }: { data: MatchupData }) {
  const anyRated = data.grid.some((row) => row.some((cell) => cell?.winRate != null))
  if (data.leaders.length < 2 || !anyRated) {
    return <MetaEmpty>Not enough matches where both leaders are known yet ({(data.identifiedMatches ?? 0).toLocaleString()} so far). A pairing needs {data.minMatches} to show.</MetaEmpty>
  }
  return (
    <div className="mstats-matrix-wrap">
      <table className="mstats-matrix">
        <thead>
          <tr>
            <td />
            {data.leaders.map((name, i) => (
              <th key={name} scope="col" title={name}><MetaArt src={data.leaderImages[i]} alt={name} size={34} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.leaders.map((rowName, r) => (
            <tr key={rowName}>
              <th scope="row" title={rowName}><MetaArt src={data.leaderImages[r]} alt={rowName} size={34} /></th>
              {(data.grid[r] || []).map((cell, c) => (
                <td
                  key={data.leaders[c]}
                  className={cell == null ? 'is-mirror' : cell.winRate == null ? 'is-thin' : ''}
                  style={cellStyle(cell)}
                  title={cell ? `${rowName} vs ${data.leaders[c]}: ${cell.wins}–${cell.losses}${cell.draws ? `–${cell.draws}` : ''} (${cell.matches} matches)` : 'Mirror'}
                >
                  {cell?.winRate != null ? Math.round(cell.winRate) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mstats-note">The eight most-played leaders, from {(data.identifiedMatches ?? 0).toLocaleString()} matches where both leaders are known. Cells under {data.minMatches} matches stay blank.</p>
    </div>
  )
}
