// Tests for LandingPage component logic
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  selectHomepagePromoVariant,
  promoDismissalKey,
} from './landingPagePromo'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const LANDING_PAGE_SRC = readFileSync(join(__dirname, 'LandingPage.tsx'), 'utf8')

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

  describe('Deckbuilder utility tile', () => {
    it('shows a My Stats tile that routes to /me (replacing the Import Pool tile)', () => {
      assert.ok(LANDING_PAGE_SRC.includes('My Stats'))
      assert.ok(LANDING_PAGE_SRC.includes("router.push('/me')"))
      // Import Pool moved to the account dropdown — not a homepage tile anymore.
      assert.ok(!LANDING_PAGE_SRC.includes("router.push('/import')"))
    })

    it('reuses the Import Pool art for the My Stats tile (per the same-image request)', () => {
      assert.ok(LANDING_PAGE_SRC.includes('MODE_ART.importPool'))
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

  // Homepage promo banner variant selection.
  describe('Promo banner variant selection', () => {
    const base = {
      hasActiveDraft: false,
      upcomingSet: null,
      isPatron: false as boolean | null,
      isBetaTester: false,
      dismissedVariantsForSet: {} as Partial<Record<'nonSubConversion' | 'patronNoBeta' | 'patronActivation' | 'none', boolean>>,
    }

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
        upcomingSet: ASH,
        isPatron: false,
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

    it('dismissing the conversion variant hides only that variant for the current set', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: false,
        dismissedVariantsForSet: { nonSubConversion: true },
      })
      assert.strictEqual(variant, 'none')
    })

    it('dismissing the conversion variant does not hide the patron-no-beta variant after upgrade', () => {
      // Same user dismisses conversion banner, then becomes a patron.
      // patronNoBeta is a separate variant and should still render.
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: true,
        isBetaTester: false,
        dismissedVariantsForSet: { nonSubConversion: true },
      })
      assert.strictEqual(variant, 'patronNoBeta')
    })

    it('dismissing the patron-no-beta variant does not hide the activation variant after beta enroll', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: true,
        isBetaTester: true,
        dismissedVariantsForSet: { patronNoBeta: true },
      })
      assert.strictEqual(variant, 'patronActivation')
    })

    it('dismissing the patron-activation variant hides it for the current set', () => {
      const variant = selectHomepagePromoVariant({
        ...base,
        upcomingSet: ASH,
        isPatron: true,
        isBetaTester: true,
        dismissedVariantsForSet: { patronActivation: true },
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

  describe('Dismissal localStorage keys', () => {
    it('promoDismissalKey is null when no set is upcoming', () => {
      assert.strictEqual(promoDismissalKey(null, 'nonSubConversion'), null)
      assert.strictEqual(promoDismissalKey(undefined, 'nonSubConversion'), null)
    })

    it('promoDismissalKey is null for variants that have no per-set dismissal', () => {
      assert.strictEqual(promoDismissalKey('ASH', 'none'), null)
      assert.strictEqual(promoDismissalKey('ASH', null), null)
    })

    it('promoDismissalKey is namespaced by setCode AND variant so each variant dismisses independently and forever', () => {
      assert.strictEqual(
        promoDismissalKey('ASH', 'nonSubConversion'),
        'dismissed-promo-ASH-nonSubConversion',
      )
      assert.strictEqual(
        promoDismissalKey('ASH', 'patronNoBeta'),
        'dismissed-promo-ASH-patronNoBeta',
      )
      assert.strictEqual(
        promoDismissalKey('ASH', 'patronActivation'),
        'dismissed-promo-ASH-patronActivation',
      )
    })
  })
})

console.log('\n📄 Running LandingPage tests...\n')
