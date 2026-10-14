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
    <figure className="mstats-scatter" aria-label="Leader popularity against win rate">
      <div className="mstats-scatter-plot">
        <span className="mstats-scatter-hline" style={{ top: y(data.avgWinRate) }} />
        <span className="mstats-scatter-vline" style={{ left: x(data.avgShare) }} />
        <span className="mstats-scatter-q mstats-scatter-q--tl">Sleepers</span>
        <span className="mstats-scatter-q mstats-scatter-q--tr">Format Pillars</span>
        <span className="mstats-scatter-q mstats-scatter-q--bl">Skip</span>
        <span className="mstats-scatter-q mstats-scatter-q--br">Traps</span>
        {data.points.map((p) => (
          <span
            key={p.leaderName}
            className="mstats-scatter-dot"
            style={{ left: x(p.share), top: y(p.winRate) }}
            title={`${p.leaderName}: ${p.winRate.toFixed(1)}% over ${p.matches} matches, in ${p.share.toFixed(1)}% of decks`}
          >
            <MetaArt src={p.imageUrl} alt={p.leaderName} />
          </span>
        ))}
        <span className="mstats-scatter-ylabel mstats-scatter-ylabel--top">{hi}%</span>
        <span className="mstats-scatter-ylabel mstats-scatter-ylabel--bottom">{lo}%</span>
      </div>
      <figcaption className="mstats-scatter-x">
        <span>Rarely built</span>
        <span>Field win rate {data.avgWinRate.toFixed(1)}%</span>
        <span>In {data.shareMax}% of decks</span>
      </figcaption>
    </figure>
  )
}
