'use client'

import type { LeaderScatter as ScatterData } from '@/src/services/meta/leaderScatter'
import { MetaArt, MetaEmpty } from './MetaBits'

/**
 * Leaders plotted by share of built decks (x) against win rate (y), split into
 * quadrants at the field average. Top-left = winning but under-played.
 */
export function LeaderScatter({ data }: { data: ScatterData }) {
  if (!data.points.length || data.avgWinRate == null || data.avgShare == null) {
    return <MetaEmpty>Not enough recorded games per leader yet.</MetaEmpty>
  }
  const [lo, hi] = data.winRateRange
  const x = (share: number) => `${(share / data.shareMax) * 100}%`
  const y = (wr: number) => `${((hi - wr) / (hi - lo)) * 100}%`
  return (
    <figure className="meta-scatter" aria-label="Leader popularity against win rate">
      <div className="meta-scatter-plot">
        <span className="meta-scatter-hline" style={{ top: y(data.avgWinRate) }} />
        <span className="meta-scatter-vline" style={{ left: x(data.avgShare) }} />
        <span className="meta-scatter-q meta-scatter-q--tl">Sleepers</span>
        <span className="meta-scatter-q meta-scatter-q--tr">Format Pillars</span>
        <span className="meta-scatter-q meta-scatter-q--bl">Skip</span>
        <span className="meta-scatter-q meta-scatter-q--br">Traps</span>
        {data.points.map((p) => (
          <span
            key={p.leaderName}
            className="meta-scatter-dot"
            style={{ left: x(p.share), top: y(p.winRate) }}
            title={`${p.leaderName}: ${p.winRate.toFixed(1)}% over ${p.matches} matches, in ${p.share.toFixed(1)}% of decks`}
          >
            <MetaArt src={p.imageUrl} alt={p.leaderName} />
          </span>
        ))}
        <span className="meta-scatter-ylabel meta-scatter-ylabel--top">{hi}%</span>
        <span className="meta-scatter-ylabel meta-scatter-ylabel--bottom">{lo}%</span>
      </div>
      <figcaption className="meta-scatter-x">
        <span>Rarely built</span>
        <span>Field win rate {data.avgWinRate.toFixed(1)}%</span>
        <span>In {data.shareMax}% of decks</span>
      </figcaption>
    </figure>
  )
}
