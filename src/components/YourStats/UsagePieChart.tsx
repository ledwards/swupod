'use client'

import { useRevealOnView } from '@/src/hooks/useRevealOnView'
import { buildUsagePieStops, usagePieColor } from './usagePie'

export interface UsagePieItem {
  key: string
  name: string
  matches: number
  /** Unit-side art for the legend thumbnail; null falls back to a color dot. */
  art: string | null
}

/**
 * A usage pie (share of the total) with a legend. Each item gets its OWN palette
 * color via the tested usagePie helper, so wedges never blend into one disc.
 * The legend's right-hand number is the pie share. Shared by the /me gameplay
 * cards ("Your Leaders", "Your Archetypes") and the Meta overview.
 */
export function UsagePie({ items, countNoun = 'game' }: { items: UsagePieItem[]; countNoun?: string }) {
  const { ref: pieRef, inView } = useRevealOnView<HTMLDivElement>()
  const total = items.filter((it) => (it.matches || 0) > 0).reduce((s, it) => s + it.matches, 0)
  const pieStops = buildUsagePieStops(items.map((it, i) => ({ matches: it.matches || 0, color: usagePieColor(i) })))
  return (
    <div className={`your-stats-leaders-pie-layout${inView ? ' your-stats-reveal' : ''}`} ref={pieRef}>
      <div
        className="your-stats-leaders-pie"
        style={{ background: pieStops ? `conic-gradient(${pieStops})` : 'rgba(255,255,255,0.08)' }}
        aria-hidden="true"
      />
      <ul className="your-stats-leaders-legend">
        {items.map((it, i) => {
          const color = usagePieColor(i)
          const sharePct = total > 0 ? Math.round((it.matches / total) * 100) : 0
          return (
            <li key={it.key} className="your-stats-leaders-legend-row">
              <span className="your-stats-leaders-legend-art" style={{ ['--leader-color' as string]: color }} aria-hidden="true">
                {it.art ? <img src={it.art} alt="" loading="lazy" /> : <span className="your-stats-leaders-legend-dot" style={{ background: color }} />}
              </span>
              <span className="your-stats-leaders-legend-name">
                <strong>{it.name}</strong>
                <small>{Number(it.matches || 0).toLocaleString()} {it.matches === 1 ? countNoun : `${countNoun}s`}</small>
              </span>
              <span className="your-stats-leaders-legend-share">{sharePct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
