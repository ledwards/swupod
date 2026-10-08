// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('useCardPreview', () => {
  describe('module exports', () => {
    it('exports useCardPreview hook', async () => {
      const mod = await import('./useCardPreview.js')
      assert.strictEqual(typeof mod.useCardPreview, 'function')
    })

    it('exports default as useCardPreview', async () => {
      const mod = await import('./useCardPreview.js')
      assert.strictEqual(mod.default, mod.useCardPreview)
    })
  })

  // Note: Hook behavior tests require React testing environment with DOM
  // The hook itself is tested through E2E tests in actual browser
})
