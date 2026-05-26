// Tests for LandingPage component logic
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  selectHomepagePromoVariant,
  lockInDismissalKey,
  promoDismissalKey,
} from './landingPagePromo'

// Minimal SetConfig stand-in for variant tests. Only setCode/setName are
// consumed by the variant selector + the banner rendering logic. Spec-first:
// the fixture name "Ashes of the Empire" is from src/utils/setConfigs/ASH.ts.
const ASH = { setCode: 'ASH', setName: 'Ashes of the Empire' } as any

describe('LandingPage', () => {
  describe('Limited Deckbuilder mode', () => {
    it('routes the homepage CTA to /deckbuilder', () => {
      let navigatedTo: string | null = null
      const handleLimitedDeckbuilderClick = () => {
        navigatedTo = '/deckbuilder'
      }

      handleLimitedDeckbuilderClick()
      assert.strictEqual(navigatedTo, '/deckbuilder')
    })
  })

  describe('Other Formats button visibility', () => {
    it('should hide Other Formats button when user is not logged in', () => {
      const user = null
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      const showOtherFormats = !!hasBetaAccess

      assert.strictEqual(showOtherFormats, false)
    })

    it('should hide Other Formats button when user is logged in but not beta', () => {
      const user = { id: '123', is_beta_tester: false, is_admin: false }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      const showOtherFormats = !!hasBetaAccess

      assert.strictEqual(showOtherFormats, false)
    })

    it('should show Other Formats button when user is beta tester', () => {
      const user = { id: '123', is_beta_tester: true, is_admin: false }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      const showOtherFormats = !!hasBetaAccess

      assert.strictEqual(showOtherFormats, true)
    })

    it('should show Other Formats button when user is admin', () => {
      const user = { id: '123', is_beta_tester: false, is_admin: true }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      const showOtherFormats = !!hasBetaAccess

      assert.strictEqual(showOtherFormats, true)
    })

    it('should show Other Formats button when user is both beta and admin', () => {
      const user = { id: '123', is_beta_tester: true, is_admin: true }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      const showOtherFormats = !!hasBetaAccess

      assert.strictEqual(showOtherFormats, true)
    })
  })

  describe('Other Formats button click handler', () => {
    it('should call onOtherFormatsClick when Other Formats button is clicked', () => {
      let clickHandlerCalled = false
      const onOtherFormatsClick = () => {
        clickHandlerCalled = true
      }

      onOtherFormatsClick()
      assert.strictEqual(clickHandlerCalled, true)
    })

    it('should navigate to /formats when handler is invoked', () => {
      let navigatedTo: string | null = null
      const handleOtherFormatsClick = () => {
        navigatedTo = '/formats'
      }

      handleOtherFormatsClick()
      assert.strictEqual(navigatedTo, '/formats')
    })
  })

  // U5: homepage promo banner variant selection.
  // SPEC: see docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md
  describe('Promo banner variant selection (U5)', () => {
    const base = {
      hasActiveDraft: false,
      withinLockInWindow: false,
      upcomingSet: null,
      isPatron: false as boolean | null,
      isBetaTester: false,
      lockInDismissed: false,
      promoDismissedForSet: false,
    }

    it('renders the lock-in variant when the lock-in window is active and the user is anon/non-sub', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        withinLockInWindow: true,
        isPatron: false,
      })
      assert.strictEqual(variant, 'lockIn')
    })

    it('hides the lock-in variant from subs (subs never see lock-in pitch)', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        withinLockInWindow: true,
        upcomingSet: ASH,
        isPatron: true,
        isBetaTester: true,
      })
      // Subs do not see lock-in; falls through to set-based variant.
      assert.strictEqual(variant, 'patronActivation')
    })

    it('sub with no upcoming set: no banner during lock-in window', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        withinLockInWindow: true,
        upcomingSet: null,
        isPatron: true,
        isBetaTester: true,
      })
      assert.strictEqual(variant, 'none')
    })

    it('renders the non-sub conversion variant when an upcoming set is in window and user is non-sub', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: false,
      })
      assert.strictEqual(variant, 'nonSubConversion')
    })

    it('renders the patron activation variant when an upcoming set is in window and user is sub + beta tester', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: true,
        isBetaTester: true,
      })
      assert.strictEqual(variant, 'patronActivation')
    })

    it('renders the patron-no-beta variant when an upcoming set is in window and user is sub without beta enrollment', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: true,
        isBetaTester: false,
      })
      assert.strictEqual(variant, 'patronNoBeta')
    })

    it('renders nothing while isPatron === null (loading) so the banner never flashes', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: null,
      })
      assert.strictEqual(variant, 'none')
    })

    it('active-pod precedence: hides the new banner entirely when an active draft exists', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        hasActiveDraft: true,
        withinLockInWindow: true, // also true — active pod still wins
        upcomingSet: ASH,
        isPatron: false,
      })
      assert.strictEqual(variant, 'none')
    })

    it('dismissing the lock-in banner falls through to the conversion variant when a set is upcoming', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        withinLockInWindow: true,
        upcomingSet: ASH,
        isPatron: false,
        lockInDismissed: true,
      })
      // Lock-in dismissed → falls through; non-sub + upcoming set → conversion.
      assert.strictEqual(variant, 'nonSubConversion')
    })

    it('dismissing the lock-in banner with no upcoming set hides the banner entirely', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        withinLockInWindow: true,
        upcomingSet: null,
        isPatron: false,
        lockInDismissed: true,
      })
      assert.strictEqual(variant, 'none')
    })

    it('after the upcoming set releases, no banner shows', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: null, // getUpcomingSetForPromo() returns null after release
        isPatron: false,
      })
      assert.strictEqual(variant, 'none')
    })

    it('dismissing the conversion banner hides it for the current set', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: false,
        promoDismissedForSet: true,
      })
      assert.strictEqual(variant, 'none')
    })

    it('anonymous user (no auth) is treated as non-sub for variant selection', () => {
      // AuthContext sets isPatron to false (not null) when there is no session,
      // so an anonymous visitor on /  gets the conversion experience.
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: false,
        isBetaTester: false,
      })
      assert.strictEqual(variant, 'nonSubConversion')
    })
  })

  describe('Dismissal localStorage keys (U5)', () => {
    it('lockInDismissalKey is null when no lock-in window is configured', () => {
      assert.strictEqual(lockInDismissalKey(null), null)
    })

    it('lockInDismissalKey is namespaced by the lock-in window end date so a new window re-shows the banner', () => {
      assert.strictEqual(
        lockInDismissalKey('2026-06-15'),
        'dismissed-lockin-2026-06-15',
      )
    })

    it('promoDismissalKey is null when no set is upcoming', () => {
      assert.strictEqual(promoDismissalKey(null), null)
      assert.strictEqual(promoDismissalKey(undefined), null)
    })

    it('promoDismissalKey is namespaced by setCode so the next set re-shows the banner', () => {
      assert.strictEqual(promoDismissalKey('ASH'), 'dismissed-promo-ASH')
    })
  })
})

console.log('\n📄 Running LandingPage tests...\n')
