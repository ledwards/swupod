import { getCyclingPackImageUrls } from '@/src/utils/packArt'

export default function EntryPackFan({ code, count }: { code?: string; count: number }) {
  const images = code ? getCyclingPackImageUrls(code, count) : []
  return (
    <div className="entry-pack-fan" aria-label={`${count} booster packs`}>
      {Array.from({ length: count }, (_, i) => {
        const position = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
        const style = {
          left: `${50 + position * 19}%`,
          transform: `translateX(-50%) rotate(${position * 24}deg)`,
          zIndex: count - Math.round(Math.abs(position) * count),
        }
        return images[i] ? (
          <img key={i} src={images[i]} alt={`Pack ${i + 1}`} style={style} />
        ) : (
          <span key={i} className="entry-skeleton" aria-hidden="true" style={style} />
        )
      })}
    </div>
  )
}
