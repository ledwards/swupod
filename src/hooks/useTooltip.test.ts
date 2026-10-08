// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('useTooltip', () => {
  describe('module exports', () => {
    it('exports useTooltip hook', async () => {
      const mod = await import('./useTooltip.js')
      assert.strictEqual(typeof mod.useTooltip, 'function')
    })

    it('exports default as useTooltip', async () => {
      const mod = await import('./useTooltip.js')
      assert.strictEqual(mod.default, mod.useTooltip)
    })
  })

  // Note: Hook behavior tests require React testing environment
  // The hook itself is tested through E2E tests in actual browser
})
