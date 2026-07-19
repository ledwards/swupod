// @ts-nocheck
/**
 * Pure gating predicate for SubscribePodBanner — extracted from the .tsx
 * component so unit tests can import it without pulling React/JSX through
 * the Node test loader.
 *
 * Pattern mirrors `landingPagePromo.ts` (pure helper file alongside the .tsx
 * component). Plan reference: U6 of
 * docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md
 */

import { isSetUpcoming } from '../utils/membership'

export interface ShouldShowPodBannerArgs {
  /** AuthContext state. null = loading, true/false = resolved. */
  isPatron: boolean | null
  /** user.is_beta_tester from AuthContext (defaults to false when missing). */
  isBetaTester: boolean
  /** Post-strip set code (component already strips -CB before calling). */
  setCode?: string | null
  /** Has the user dismissed this set's banner this session? */
  sessionDismissed: boolean
  /** Injectable clock — "upcoming" is relative to the set's release date. Defaults to now. */
  now?: Date
}

export type ShouldShowPodBannerResult =
  | { show: false }
  | { show: true; variant: 'subscribe' | 'activate' }

/**
 * Decision table:
 *
 *   isPatron === null              → { show: false }     loading
 *   !setCode                       → { show: false }     no set on pod
 *   !isSetUpcoming(setCode)        → { show: false }     set already released
 *   sessionDismissed               → { show: false }     spam guard
 *   isPatron === false             → subscribe variant   (Patreon CTA)
 *   isPatron === true, !beta       → activate variant    (/beta CTA)
 *   isPatron === true, beta        → { show: false }     normal sub experience
 */
export function shouldShowPodBanner({
  isPatron,
  isBetaTester,
  setCode,
  sessionDismissed,
  now,
}: ShouldShowPodBannerArgs): ShouldShowPodBannerResult {
  if (isPatron === null) return { show: false }
  if (!setCode) return { show: false }
  if (!isSetUpcoming(setCode, now)) return { show: false }
  if (sessionDismissed) return { show: false }

  if (isPatron === false) {
    return { show: true, variant: 'subscribe' }
  }
  if (!isBetaTester) {
    return { show: true, variant: 'activate' }
  }
  return { show: false }
}
