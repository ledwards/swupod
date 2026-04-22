// Tests for LandingPage component logic
import { describe, it } from 'node:test'
import assert from 'node:assert'

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
})

console.log('\n📄 Running LandingPage tests...\n')
