// @ts-nocheck
/**
 * Homepage promo banner variant selection (U5).
 *
 * Pure logic, no React. Lives next to LandingPage.tsx so the variant rules
 * are unit-testable per .claude/rules/testing.md without spinning up jsdom.
 *
 * Priority (highest first):
 *   1. activeDraft (rendered by existing .active-draft-banner) — caller hides
 *      the new banner when an active pod exists. selectHomepagePromoVariant
 *      returns 'none' so the component renders nothing.
 *   2. lock-in (transient, isWithinLockInWindow() true) — anon/non-sub only.
 *   3. non-sub conversion (upcoming set + isPatron === false).
 *   4. patron-no-beta (upcoming set + patron without beta enrollment).
 *   5. patron activation (upcoming set + patron with beta enrollment).
 *
 * isPatron === null (loading) → 'none' (no flash).
 * Anonymous (no user, isPatron === false) → treated as non-sub.
 */

import type { SetConfig } from '../utils/setConfigs/index'

export type PromoVariant =
  | 'none'
  | 'lockIn'
  | 'nonSubConversion'
  | 'patronNoBeta'
  | 'patronActivation'

export interface PromoVariantInput {
  /** True when the user already has an active pod showing in .active-draft-banner. */
  hasActiveDraft: boolean
  /** True when "now" is before LOCK_IN_WINDOW_END_DATE. */
  withinLockInWindow: boolean
  /** Next upcoming set for the homepage banner (or null when none). */
  upcomingSet: SetConfig | null
  /** Patron status from useAuth(). null = loading. */
  isPatron: boolean | null
  /** Whether the user has clicked "Join the Beta" (only meaningful when isPatron === true). */
  isBetaTester: boolean
  /** True for the lock-in dismissal localStorage key (set after dismiss). */
  lockInDismissed: boolean
  /**
   * Per-variant dismissal flags keyed by setCode. A dismissal hides only the
   * variant the user actually closed: a logged-out user dismissing the
   * conversion banner does NOT also dismiss the patron-no-beta or activation
   * banners they might see after upgrading.
   */
  dismissedVariantsForSet: Partial<Record<PromoVariant, boolean>>
}

export function selectHomepagePromoVariant(input: PromoVariantInput): PromoVariant {
  // Priority 1: active pod always wins (rendered by existing banner; we render nothing).
  if (input.hasActiveDraft) return 'none'

  // Loading state — never flash a banner before isPatron resolves.
  if (input.isPatron === null) return 'none'

  // Priority 2: lock-in window. Subs do not see the lock-in pitch.
  if (input.withinLockInWindow && input.isPatron === false) {
    if (input.lockInDismissed) {
      // Lock-in dismissed; fall through to set-based variants below.
    } else {
      return 'lockIn'
    }
  }

  // Priorities 3–5 all require an upcoming set.
  if (!input.upcomingSet) return 'none'

  let target: PromoVariant
  if (input.isPatron === false) {
    target = 'nonSubConversion'
  } else if (input.isBetaTester) {
    // isPatron === true from here on.
    target = 'patronActivation'
  } else {
    target = 'patronNoBeta'
  }

  // Per-variant dismissal is the final hide gate. A user can dismiss one
  // variant and later see another (e.g., dismiss conversion → become patron →
  // see patron-no-beta).
  if (input.dismissedVariantsForSet[target]) return 'none'
  return target
}

export function lockInDismissalKey(lockInEndDate: string | null): string | null {
  if (!lockInEndDate) return null
  return `dismissed-lockin-${lockInEndDate}`
}

export function promoDismissalKey(
  setCode: string | null | undefined,
  variant: PromoVariant | null | undefined,
): string | null {
  if (!setCode) return null
  if (!variant || variant === 'none' || variant === 'lockIn') return null
  return `dismissed-promo-${setCode}-${variant}`
}
