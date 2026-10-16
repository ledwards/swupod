/**
 * Pieces shared by the two alpha GC 2026 gift pages (/gift/gc2026 and
 * /gift/gc2026/black): the pack figures and the placeholder-art notice.
 */
import { LockIcon } from '@/src/components/DraftLog/icons'
import './gift-alpha.css'

export const GC2026_PACK_IMAGE = {
  silver: '/pack-images/gc2026-silver-pack.png',
  black: '/pack-images/gc2026-black-pack.png',
} as const

/** Where unlocked Event Packs are used. */
export const GC2026_CHAOS_URL = '/formats/chaos-sealed'

export function GiftPack({
  tier,
  locked = false,
  tag,
  tagTone,
}: {
  tier: 'silver' | 'black'
  locked?: boolean
  tag: string
  tagTone: 'success' | 'accent'
}) {
  const name = tier === 'silver' ? 'Silver Pack' : 'Black Pack'
  return (
    <figure className={`gfta-pack${locked ? ' is-locked' : ''}`}>
      <div className="gfta-pack-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={GC2026_PACK_IMAGE[tier]} alt={`GC 2026 ${name.replace(' Pack', '')} Event Pack`} width={544} height={800} />
        {locked && (
          <span className="gfta-lock" aria-label="Locked">
            <LockIcon open={false} />
          </span>
        )}
      </div>
      <figcaption>
        <span className="tpage-title">{name}</span>
        <span className={`tpage-tag tpage-tag--${tagTone}`}>{tag}</span>
      </figcaption>
    </figure>
  )
}

export function PlaceholderArtNote({ plural }: { plural: boolean }) {
  return (
    <div className="tpage-raised gfta-note" role="note">
      <p className="tpage-copy">
        The official GC 2026 alt-art has been revealed but isn&apos;t in the card database yet, so
        the cards you unlock show <strong>placeholder images</strong> for now. They switch to the
        final art automatically once it&apos;s added. The {plural ? 'packs' : 'pack'} on your account
        {plural ? ' stay' : ' stays'} exactly the same.
      </p>
    </div>
  )
}
