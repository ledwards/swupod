// @ts-nocheck
/**
 * Homepage promo banner variant selection.
 *
 * Pure logic, no React. Lives next to LandingPage.tsx so the variant rules
 * are unit-testable per .claude/rules/testing.md without spinning up jsdom.
 *
 * Priority (highest first):
 *   1. activeDraft (rendered by existing .active-draft-banner) — caller hides
 *      the new banner when an active pod exists. selectHomepagePromoVariant
 *      returns 'none' so the component renders nothing.
 *   2. non-sub conversion (upcoming set + isPatron === false).
 *   3. patron-no-beta (upcoming set + patron without beta enrollment).
 *   4. patron activation (upcoming set + patron with beta enrollment).
 *
 * isPatron === null (loading) → 'none' (no flash).
 * Anonymous (no user, isPatron === false) → treated as non-sub.
 */

import type { SetConfig } from '../utils/setConfigs/index'

export type PromoVariant =
  | 'none'
  | 'nonSubConversion'
  | 'patronNoBeta'
  | 'patronActivation'

export interface PromoVariantInput {
  /** True when the user already has an active pod showing in .active-draft-banner. */
  hasActiveDraft: boolean
  /** Next upcoming set for the homepage banner (or null when none). */
  upcomingSet: SetConfig | null
  /** Patron status from useAuth(). null = loading. */
  isPatron: boolean | null
  /** Whether the user has clicked "Join the Beta" (only meaningful when isPatron === true). */
  isBetaTester: boolean
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

  // Remaining priorities all require an upcoming set.
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

export function promoDismissalKey(
  setCode: string | null | undefined,
  variant: PromoVariant | null | undefined,
): string | null {
  if (!setCode) return null
  if (!variant || variant === 'none') return null
  return `dismissed-promo-${setCode}-${variant}`
}
