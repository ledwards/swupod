// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

describe('useIsMobile', () => {
  let originalWindow: typeof globalThis.window | undefined
  let originalNavigator: typeof globalThis.navigator | undefined
  let originalNavigatorDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    originalWindow = (global as any).window
    originalNavigator = (global as any).navigator
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  })

  afterEach(() => {
    ;(global as any).window = originalWindow
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
    } else if (originalNavigator === undefined) {
      delete (global as any).navigator
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: originalNavigator,
      })
    }
  })

  describe('isMobileDevice (non-hook)', () => {
    it('returns false when window is undefined (SSR)', async () => {
      (global as any).window = undefined
      const { isMobileDevice } = await import('./useIsMobile.js')
      assert.strictEqual(isMobileDevice(), false)
    })

    // Note: Additional browser-specific tests would require a browser environment
    // The hook itself is tested through integration tests in actual browser
  })

  describe('module exports', () => {
    it('exports useIsMobile hook', async () => {
      const mod = await import('./useIsMobile.js')
      assert.strictEqual(typeof mod.useIsMobile, 'function')
    })

    it('exports isMobileDevice function', async () => {
      const mod = await import('./useIsMobile.js')
      assert.strictEqual(typeof mod.isMobileDevice, 'function')
    })

    it('exports default as useIsMobile', async () => {
      const mod = await import('./useIsMobile.js')
      assert.strictEqual(mod.default, mod.useIsMobile)
    })
  })
})
