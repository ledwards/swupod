import type { CSSProperties } from 'react'
import { getCyclingPackImageUrls, getPackImageUrl } from '../../utils/packArt'

/**
 * A small fan of booster packs for a format tile, one pack per entry in `codes`.
 * Same-set entries cycle through that set's pack art; mixed sets show each set's
 * pack, so chaos formats read as chaos at a glance. Fan geometry follows
 * EntryPackFan.
 */
/** Thrown, not fanned: fixed offsets per pack count so the hub tiles read as chaos (x px, lift px, degrees). */
const SCATTER: Record<number, [number, number, number][]> = {
  1: [[0, 2, -5]],
  2: [[-30, 8, -12], [32, -2, 9]],
  3: [[-62, 10, -15], [2, -6, 5], [64, 4, 17]],
}

export default function FormatPackFan({ codes, className = "", scatter = false }: { codes: string[]; className?: string; scatter?: boolean }) {
  const seen = new Map<string, number>()
  const images = codes.map(code => {
    const n = seen.get(code) ?? 0
    seen.set(code, n + 1)
    return getCyclingPackImageUrls(code, n + 1)[n] ?? getPackImageUrl(code)
  })
  const count = images.length
  const thrown = scatter ? SCATTER[count] : undefined
  if (thrown) {
    return (
      <span className={`of-fan of-fan--scatter ${className}`.trim()} aria-hidden="true">
        {images.map((src, i) => {
          const [x, y, r] = thrown[i] ?? [0, 0, 0]
          return <img key={i} src={src} alt="" data-wf-no-card-stats="" style={{ '--x': `${x}px`, '--y': `${y}px`, '--r': `${r}deg`, zIndex: i === 1 ? 3 : 2 } as CSSProperties}/>
        })}
      </span>
    )
  }
  return (
    <span className={`of-fan ${className}`.trim()} aria-hidden="true">
      {images.map((src, i) => {
        const position = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
        return (
          <img
            key={i}
            src={src}
            alt=""
            data-wf-no-card-stats=""
            style={{ left: `${50 + position * 22}%`, transform: `translateX(-50%) rotate(${position * 14}deg)`, zIndex: count - Math.round(Math.abs(position) * count) }}
          />
        )
      })}
    </span>
  )
}
