'use client'

import type { MatchupCell } from '@/src/services/meta/leaderMatchups'
import { MetaArt, MetaEmpty } from './MetaBits'

export interface MatchupData {
  leaders: string[]
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
  if (data.leaders.length < 2) return <MetaEmpty>Not enough recorded matches between leaders yet.</MetaEmpty>
  return (
    <div className="meta-matrix-wrap">
      <table className="meta-matrix">
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
      <p className="meta-note">The eight most-played leaders. Cells under {data.minMatches} matches stay blank.</p>
    </div>
  )
}
