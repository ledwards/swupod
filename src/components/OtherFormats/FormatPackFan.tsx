import { getCyclingPackImageUrls, getPackImageUrl } from '../../utils/packArt'

/**
 * A small fan of booster packs for a format tile, one pack per entry in `codes`.
 * Same-set entries cycle through that set's pack art; mixed sets show each set's
 * pack, so chaos formats read as chaos at a glance. Fan geometry follows
 * EntryPackFan.
 */
export default function FormatPackFan({ codes, className = "" }: { codes: string[]; className?: string }) {
  const seen = new Map<string, number>()
  const images = codes.map(code => {
    const n = seen.get(code) ?? 0
    seen.set(code, n + 1)
    return getCyclingPackImageUrls(code, n + 1)[n] ?? getPackImageUrl(code)
  })
  const count = images.length
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
