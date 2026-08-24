'use client'

/**
 * FriendOfThePodCTA — the one "become a Friend of the Pod" pitch, in two shapes.
 *
 *   <FriendOfThePodCTA variant="inline" />   // footer row inside the voice dropdown
 *   <FriendOfThePodCTA />                    // banner under a page's content
 *
 * A link, not a button: it leaves the site for Patreon. Gating lives at the call
 * site — every caller already knows the viewer's patron status (the picker from
 * its entitlements fetch, pages from AuthContext), and this renders whatever it
 * is given so it can also be previewed.
 *
 * The perks named here are the two that carry: every creator voice pack without
 * a code, and early access to a new set while it is still spoilers. The full
 * list is PATREON_FEATURES (src/utils/patreonFeatures.ts) — do not grow this
 * copy into a second, drifting list.
 */

import { PATREON_URL } from '@/src/utils/membership'
import './FriendOfThePodCTA.css'

interface Props {
  /** `inline` is the tight row used inside a dropdown; `banner` is the page block. */
  variant?: 'inline' | 'banner'
  className?: string
}

export default function FriendOfThePodCTA({ variant = 'banner', className }: Props) {
  const inline = variant === 'inline'

  return (
    <a
      className={`fotp-cta fotp-cta--${variant}${className ? ` ${className}` : ''}`}
      href={PATREON_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="fotp-cta-star" aria-hidden="true">★</span>
      <span className="fotp-cta-text">
        <span className="fotp-cta-title">
          {inline ? 'Unlock every voice' : 'Become a Friend of the Pod'}
        </span>
        <span className="fotp-cta-copy">
          {inline ? (
            <>
              Friends of the Pod get every creator&apos;s voice pack without a code, plus
              early access to every new set.
            </>
          ) : (
            <>
              Every creator&apos;s voice pack without a code, early access to every new set
              weeks before it releases, and more.
            </>
          )}
        </span>
      </span>
      <span className="fotp-cta-arrow" aria-hidden="true">→</span>
    </a>
  )
}
