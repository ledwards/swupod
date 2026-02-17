/**
 * Tests for formatAccess utility
 * Bug #11: Pack Blitz and Pack Wars should be open access, not beta
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  FORMAT_ACCESS_RULES,
  hasFormatAccess,
  getFormatBadge,
  type FormatAccess,
} from './formatAccess'

describe('formatAccess', () => {
  describe('FORMAT_ACCESS_RULES', () => {
    it('should define Pack Wars as open access (FIXED)', () => {
      assert.strictEqual(FORMAT_ACCESS_RULES['pack-wars'], 'open')
    })

    it('should define Pack Blitz as open access (FIXED)', () => {
      assert.strictEqual(FORMAT_ACCESS_RULES['pack-blitz'], 'open')
    })

    it('should define Chaos Draft as open access', () => {
      assert.strictEqual(FORMAT_ACCESS_RULES['chaos-draft'], 'open')
    })

    it('should define Chaos Sealed as open access', () => {
      assert.strictEqual(FORMAT_ACCESS_RULES['chaos-sealed'], 'open')
    })

    it('should define Rotisserie as coming-soon', () => {
      assert.strictEqual(FORMAT_ACCESS_RULES['rotisserie'], 'coming-soon')
    })
  })

  describe('hasFormatAccess', () => {
    describe('open formats', () => {
      it('should allow access to Pack Wars without login', () => {
        const hasAccess = hasFormatAccess('pack-wars', null)
        assert.strictEqual(hasAccess, true)
      })

      it('should allow access to Pack Blitz without login', () => {
        const hasAccess = hasFormatAccess('pack-blitz', null)
        assert.strictEqual(hasAccess, true)
      })

      it('should allow access to Chaos Draft without login', () => {
        const hasAccess = hasFormatAccess('chaos-draft', null)
        assert.strictEqual(hasAccess, true)
      })

      it('should allow access to open formats for regular users', () => {
        const user = { is_beta_tester: false, is_admin: false }
        assert.strictEqual(hasFormatAccess('pack-wars', user), true)
        assert.strictEqual(hasFormatAccess('pack-blitz', user), true)
        assert.strictEqual(hasFormatAccess('chaos-draft', user), true)
        assert.strictEqual(hasFormatAccess('chaos-sealed', user), true)
      })
    })

    describe('beta formats', () => {
      it('should deny access to beta formats without login', () => {
        // No beta formats currently exist, but test the logic
        const originalRules = { ...FORMAT_ACCESS_RULES }
        // @ts-ignore - testing hypothetical beta format
        FORMAT_ACCESS_RULES['test-beta'] = 'beta'

        const hasAccess = hasFormatAccess('test-beta', null)
        assert.strictEqual(hasAccess, false)

        // Restore
        delete FORMAT_ACCESS_RULES['test-beta']
      })

      it('should deny access to beta formats for regular users', () => {
        const user = { is_beta_tester: false, is_admin: false }
        // @ts-ignore
        FORMAT_ACCESS_RULES['test-beta'] = 'beta'

        const hasAccess = hasFormatAccess('test-beta', user)
        assert.strictEqual(hasAccess, false)

        delete FORMAT_ACCESS_RULES['test-beta']
      })

      it('should allow access to beta formats for beta testers', () => {
        const user = { is_beta_tester: true, is_admin: false }
        // @ts-ignore
        FORMAT_ACCESS_RULES['test-beta'] = 'beta'

        const hasAccess = hasFormatAccess('test-beta', user)
        assert.strictEqual(hasAccess, true)

        delete FORMAT_ACCESS_RULES['test-beta']
      })

      it('should allow access to beta formats for admins', () => {
        const user = { is_beta_tester: false, is_admin: true }
        // @ts-ignore
        FORMAT_ACCESS_RULES['test-beta'] = 'beta'

        const hasAccess = hasFormatAccess('test-beta', user)
        assert.strictEqual(hasAccess, true)

        delete FORMAT_ACCESS_RULES['test-beta']
      })
    })

    describe('coming-soon formats', () => {
      it('should deny access to Rotisserie for everyone', () => {
        assert.strictEqual(hasFormatAccess('rotisserie', null), false)
        assert.strictEqual(
          hasFormatAccess('rotisserie', { is_beta_tester: false, is_admin: false }),
          false
        )
        assert.strictEqual(
          hasFormatAccess('rotisserie', { is_beta_tester: true, is_admin: false }),
          false
        )
        assert.strictEqual(
          hasFormatAccess('rotisserie', { is_beta_tester: false, is_admin: true }),
          false
        )
      })
    })

    describe('unknown formats', () => {
      it('should deny access to unknown formats', () => {
        const hasAccess = hasFormatAccess('unknown-format', null)
        assert.strictEqual(hasAccess, false)
      })
    })
  })

  describe('getFormatBadge', () => {
    it('should return null for Pack Wars (open access)', () => {
      const badge = getFormatBadge('pack-wars')
      assert.strictEqual(badge, null)
    })

    it('should return null for Pack Blitz (open access)', () => {
      const badge = getFormatBadge('pack-blitz')
      assert.strictEqual(badge, null)
    })

    it('should return null for all open formats', () => {
      assert.strictEqual(getFormatBadge('chaos-draft'), null)
      assert.strictEqual(getFormatBadge('chaos-sealed'), null)
    })

    it('should return "COMING SOON" for Rotisserie', () => {
      const badge = getFormatBadge('rotisserie')
      assert.strictEqual(badge, 'COMING SOON')
    })

    it('should return "BETA" for beta formats', () => {
      // @ts-ignore
      FORMAT_ACCESS_RULES['test-beta'] = 'beta'

      const badge = getFormatBadge('test-beta')
      assert.strictEqual(badge, 'BETA')

      delete FORMAT_ACCESS_RULES['test-beta']
    })

    it('should return null for unknown formats', () => {
      const badge = getFormatBadge('unknown-format')
      assert.strictEqual(badge, null)
    })
  })

  describe('Bug #11 regression prevention', () => {
    it('BUGGY: OLD CODE treated Pack Wars as beta (demonstrating the bug)', () => {
      const buggyRules: Record<string, FormatAccess> = {
        'pack-wars': 'beta',  // BUG: should be 'open'
      }

      const user = { is_beta_tester: false, is_admin: false }
      const wouldHaveAccess = buggyRules['pack-wars'] === 'open'

      assert.strictEqual(
        wouldHaveAccess,
        false,
        'BUG: Pack Wars was incorrectly marked as beta'
      )
    })

    it('BUGGY: OLD CODE treated Pack Blitz as beta (demonstrating the bug)', () => {
      const buggyRules: Record<string, FormatAccess> = {
        'pack-blitz': 'beta',  // BUG: should be 'open'
      }

      const user = { is_beta_tester: false, is_admin: false }
      const wouldHaveAccess = buggyRules['pack-blitz'] === 'open'

      assert.strictEqual(
        wouldHaveAccess,
        false,
        'BUG: Pack Blitz was incorrectly marked as beta'
      )
    })

    it('FIXED: NEW CODE treats Pack Wars as open', () => {
      const user = { is_beta_tester: false, is_admin: false }
      const hasAccess = hasFormatAccess('pack-wars', user)

      assert.strictEqual(
        hasAccess,
        true,
        'FIXED: Pack Wars is now open access'
      )
    })

    it('FIXED: NEW CODE treats Pack Blitz as open', () => {
      const user = { is_beta_tester: false, is_admin: false }
      const hasAccess = hasFormatAccess('pack-blitz', user)

      assert.strictEqual(
        hasAccess,
        true,
        'FIXED: Pack Blitz is now open access'
      )
    })
  })
})

console.log('\n📄 Running formatAccess tests...\n')
