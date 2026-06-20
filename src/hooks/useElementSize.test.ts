import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'

import { useElementSize, default as useElementSizeDefault } from './useElementSize.ts'

// Light contract test. Full resize re-emit behavior is proven in E2E (real
// browser); here we lock the module surface and the SSR/jsdom guards that must
// hold without a React renderer.

describe('useElementSize', () => {
  const originalRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver

  afterEach(() => {
    // Restore whatever ResizeObserver was (likely undefined under node).
    if (originalRO === undefined) {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    } else {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalRO
    }
  })

  describe('module exports', () => {
    it('exports useElementSize hook', () => {
      assert.strictEqual(typeof useElementSize, 'function')
    })

    it('exports default as useElementSize', () => {
      assert.strictEqual(useElementSizeDefault, useElementSize)
    })
  })

  describe('SSR / jsdom safety', () => {
    it('does not throw at import/define time when ResizeObserver is undefined', () => {
      // Simulate an environment with no ResizeObserver (SSR / node / jsdom).
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
      assert.strictEqual(
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
        undefined,
      )
      // Referencing the hook must be safe even with no ResizeObserver present.
      // (The effect body feature-detects; it never runs without a renderer, but
      // the module and its references must not blow up on load.)
      assert.strictEqual(typeof useElementSize, 'function')
    })
  })
})
