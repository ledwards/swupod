// @ts-nocheck
// Tests for SetSelection / PackSelector "Coming Soon" teaser logic (U3).
// Spec: docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md
//
// We test the pure helpers in src/components/setSelectionTeaser.ts rather
// than the React component itself — the project test runner is Node's built-in
// test runner with no JSX rendering tooling, so component-side tests stay in
// the same shape as LandingPage.test.ts / SubscribePodBanner.test.ts.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildTeaserModalCopy,
  getTeaserUserState,
  shouldPeekUnreleased,
} from './setSelectionTeaser'
import { BETA_ENROLL_URL, PATREON_URL } from '../utils/membership'

describe('SetSelection — "Coming Soon" teaser logic (U3)', () => {
  describe('getTeaserUserState — three-state user model', () => {
    it('SPEC: isPatron===null resolves to "loading" so the teaser never flashes', () => {
      assert.strictEqual(getTeaserUserState(null, false), 'loading')
      assert.strictEqual(getTeaserUserState(null, true), 'loading')
      assert.strictEqual(getTeaserUserState(undefined, false), 'loading')
    })

    it('SPEC: isPatron===false resolves to "nonSub" (anon or non-patron)', () => {
      assert.strictEqual(getTeaserUserState(false, false), 'nonSub')
      // Anonymous user has no beta-tester field; null/undefined safe.
      assert.strictEqual(getTeaserUserState(false, null), 'nonSub')
      assert.strictEqual(getTeaserUserState(false, undefined), 'nonSub')
    })

    it('SPEC: isPatron===true + is_beta_tester=false resolves to "patronNoBeta"', () => {
      assert.strictEqual(getTeaserUserState(true, false), 'patronNoBeta')
      assert.strictEqual(getTeaserUserState(true, null), 'patronNoBeta')
      assert.strictEqual(getTeaserUserState(true, undefined), 'patronNoBeta')
    })

    it('SPEC: isPatron===true + is_beta_tester=true resolves to "patronBeta" (no teaser)', () => {
      assert.strictEqual(getTeaserUserState(true, true), 'patronBeta')
    })

    it('SPEC: admin users are treated as "patronBeta" (admins have unrestricted set access)', () => {
      // Existing fetchSets path uses `is_admin || is_beta_tester` as the
      // unified beta-access predicate. Admins must NOT see the teaser, because
      // they see ASH as a normal selectable card via includeBeta=true.
      assert.strictEqual(getTeaserUserState(true, false, true), 'patronBeta')
      assert.strictEqual(getTeaserUserState(true, true, true), 'patronBeta')
      // Non-patron admin (test/dev scenario): still no teaser, because the
      // admin path bypasses patron status entirely.
      assert.strictEqual(getTeaserUserState(false, false, true), 'patronBeta')
    })

    it('SPEC: uses explicit === comparison, not !isPatron coercion', () => {
      // Defensive: if someone passes a non-boolean truthy value (shouldn't
      // happen, but document the contract) the helper should treat it as
      // "loading" rather than "nonSub". This guards against future drift.
      assert.notStrictEqual(getTeaserUserState(null, false), 'nonSub')
    })
  })

  describe('shouldPeekUnreleased — when to inject the teaser', () => {
    it('SPEC: non-subs see the teaser', () => {
      assert.strictEqual(shouldPeekUnreleased('nonSub'), true)
    })

    it('SPEC: patrons without beta enrollment see the teaser (with softer CTA)', () => {
      assert.strictEqual(shouldPeekUnreleased('patronNoBeta'), true)
    })

    it('SPEC: patrons with beta enrollment do NOT see the teaser (date gate handles it)', () => {
      assert.strictEqual(shouldPeekUnreleased('patronBeta'), false)
    })

    it('SPEC: loading state does NOT fetch with peek (avoid teaser flash)', () => {
      assert.strictEqual(shouldPeekUnreleased('loading'), false)
    })
  })

  describe('buildTeaserModalCopy — per-state modal copy', () => {
    const SET_NAME = 'Ashes of the Empire'

    it('SPEC: non-sub gets "Get early access to {setName}" + Patreon CTA', () => {
      const copy = buildTeaserModalCopy('nonSub', SET_NAME)
      assert.strictEqual(copy.headline, 'Get early access to Ashes of the Empire')
      assert.strictEqual(copy.ctaUrl, PATREON_URL)
      assert.strictEqual(copy.ctaLabel, 'Become a Friend of the Pod')
    })

    it('SPEC: patron-no-beta gets "Enroll in beta to play {setName}" + /beta CTA', () => {
      const copy = buildTeaserModalCopy('patronNoBeta', SET_NAME)
      assert.strictEqual(copy.headline, 'Enroll in beta to play Ashes of the Empire')
      assert.strictEqual(copy.ctaUrl, BETA_ENROLL_URL)
      assert.strictEqual(copy.ctaLabel, 'Enroll in Beta')
    })

    it('SPEC: the patron-no-beta CTA points to the internal /beta page, not Patreon', () => {
      const copy = buildTeaserModalCopy('patronNoBeta', SET_NAME)
      assert.ok(!copy.ctaUrl.startsWith('http'), 'patron-no-beta CTA should be internal, not external')
    })

    it('SPEC: defensive fallback for unexpected state still returns valid copy', () => {
      // patronBeta + loading shouldn't normally fire the modal, but the helper
      // returns the non-sub copy as a safe default rather than blowing up.
      const copy = buildTeaserModalCopy('patronBeta', SET_NAME)
      assert.ok(copy.headline)
      assert.ok(copy.ctaUrl)
      assert.ok(copy.ctaLabel)
    })
  })

  // Integration test scenarios from U3 plan, end-to-end via the helpers.
  describe('U3 plan test scenarios — end-to-end via helpers', () => {
    it('Scenario: non-sub on /sealed sees released sets + ASH teaser', () => {
      const state = getTeaserUserState(false, false)
      assert.strictEqual(state, 'nonSub')
      assert.strictEqual(shouldPeekUnreleased(state), true)
      const copy = buildTeaserModalCopy(state, 'Ashes of the Empire')
      assert.strictEqual(copy.ctaUrl, PATREON_URL)
    })

    it('Scenario: sub-with-beta sees ASH as normal selectable card (no teaser)', () => {
      const state = getTeaserUserState(true, true)
      assert.strictEqual(state, 'patronBeta')
      assert.strictEqual(shouldPeekUnreleased(state), false)
    })

    it('Scenario: patron-no-beta sees teaser with "Enroll in Beta" CTA', () => {
      const state = getTeaserUserState(true, false)
      assert.strictEqual(state, 'patronNoBeta')
      assert.strictEqual(shouldPeekUnreleased(state), true)
      const copy = buildTeaserModalCopy(state, 'Ashes of the Empire')
      assert.strictEqual(copy.ctaLabel, 'Enroll in Beta')
      assert.strictEqual(copy.ctaUrl, BETA_ENROLL_URL)
    })

    it('Scenario: isPatron===null renders no teaser', () => {
      const state = getTeaserUserState(null, false)
      assert.strictEqual(state, 'loading')
      assert.strictEqual(shouldPeekUnreleased(state), false)
    })
  })
})

console.log('\n🪧 Running SetSelection tests...\n')
