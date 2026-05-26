/**
 * Pure helpers powering the "Coming Soon" teaser in SetSelection / PackSelector
 * / rotisserie inline picker.
 *
 * The component-side React code reads useAuth() and calls these to decide:
 *   - should fetchSets() be called with peekUnreleased=true?
 *   - which SubscribeModal headline + CTA to use?
 *
 * Pulled out of SetSelection.tsx for the same reason landingPagePromo.ts was
 * pulled out of LandingPage.tsx: pure logic is easier to test than React
 * rendering, especially given we use Node's built-in test runner (no JSX
 * rendering tooling).
 *
 * See docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md U3.
 */

import { BETA_ENROLL_URL, PATREON_URL } from '../utils/membership'

export type TeaserUserState =
  | 'loading'       // isPatron === null
  | 'nonSub'        // isPatron === false (anon or non-sub)
  | 'patronNoBeta'  // isPatron === true && !is_beta_tester
  | 'patronBeta'    // isPatron === true && (is_beta_tester || is_admin)

/**
 * SPEC: derive the three-state user model from auth context.
 *  - isPatron === null -> 'loading' (caller renders nothing)
 *  - isPatron === false -> 'nonSub' (anon or non-sub gets the teaser + Patreon CTA)
 *  - isPatron === true && !is_beta_tester && !is_admin -> 'patronNoBeta'
 *  - isPatron === true && (is_beta_tester || is_admin) -> 'patronBeta' (no teaser)
 *
 * Note we explicitly check `isPatron === false` (and `=== true`) per the plan
 * — `!isPatron` would treat the loading null as non-sub and flash the teaser.
 *
 * Admin is folded into the "has beta access" branch because the existing
 * fetchSets/SetSelection logic treats `is_admin || is_beta_tester` as the
 * unified beta-access predicate — admins see all unreleased sets as normal
 * selectable cards, not as teasers.
 */
export function getTeaserUserState(
  isPatron: boolean | null | undefined,
  isBetaTester: boolean | null | undefined,
  isAdmin: boolean | null | undefined = false,
): TeaserUserState {
  if (isPatron === null || isPatron === undefined) return 'loading'
  // Admins always have unrestricted set access — never show the teaser to
  // them, even if they aren't currently a patron (test/dev scenario).
  if (isAdmin === true) return 'patronBeta'
  if (isPatron === false) return 'nonSub'
  if (isPatron === true && isBetaTester !== true) return 'patronNoBeta'
  return 'patronBeta'
}

/**
 * SPEC: does this user state want the next-unreleased-set teaser?
 *  - nonSub: yes (Patreon CTA)
 *  - patronNoBeta: yes (/beta CTA)
 *  - patronBeta: no (sees ASH as a normal selectable card via the date gate)
 *  - loading: no (don't fetch until isPatron resolves)
 */
export function shouldPeekUnreleased(state: TeaserUserState): boolean {
  return state === 'nonSub' || state === 'patronNoBeta'
}

export interface TeaserModalCopy {
  headline: string
  ctaUrl: string
  ctaLabel: string
}

/**
 * SPEC: build the SubscribeModal headline + CTA for a given user state.
 * Non-sub gets "Get early access to {setName}" + Patreon link.
 * Patron-without-beta gets "Enroll in beta to play {setName}" + /beta link.
 * Other states are not expected to fire the modal; defaults are defensive.
 */
export function buildTeaserModalCopy(
  state: TeaserUserState,
  setName: string,
): TeaserModalCopy {
  if (state === 'patronNoBeta') {
    return {
      headline: `Enroll in beta to play ${setName}`,
      ctaUrl: BETA_ENROLL_URL,
      ctaLabel: 'Enroll in Beta',
    }
  }
  return {
    headline: `Get early access to ${setName}`,
    ctaUrl: PATREON_URL,
    ctaLabel: 'Become a Member',
  }
}
