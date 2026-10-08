// @ts-nocheck
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

describe('useLocalStorage', () => {
  let originalWindow: typeof globalThis.window | undefined

  beforeEach(() => {
    originalWindow = (global as any).window
  })

  afterEach(() => {
    (global as any).window = originalWindow
  })

  describe('SSR safety', () => {
    it('storage.get returns fallback when window undefined', async () => {
      (global as any).window = undefined
      const { storage } = await import('./useLocalStorage.js')
      const result = storage.get('any-key', 'fallback')
      assert.strictEqual(result, 'fallback')
    })

    it('storage.set returns false when window undefined', async () => {
      (global as any).window = undefined
      const { storage } = await import('./useLocalStorage.js')
      const result = storage.set('any-key', 'value')
      assert.strictEqual(result, false)
    })

    it('storage.remove does not throw when window undefined', async () => {
      (global as any).window = undefined
      const { storage } = await import('./useLocalStorage.js')
      // Should not throw
      storage.remove('any-key')
      assert.ok(true)
    })
  })

  describe('module exports', () => {
    it('exports useLocalStorage hook', async () => {
      const mod = await import('./useLocalStorage.js')
      assert.strictEqual(typeof mod.useLocalStorage, 'function')
    })

    it('exports useLocalStorageValue hook', async () => {
      const mod = await import('./useLocalStorage.js')
      assert.strictEqual(typeof mod.useLocalStorageValue, 'function')
    })

    it('exports storage utilities', async () => {
      const mod = await import('./useLocalStorage.js')
      assert.strictEqual(typeof mod.storage, 'object')
      assert.strictEqual(typeof mod.storage.get, 'function')
      assert.strictEqual(typeof mod.storage.set, 'function')
      assert.strictEqual(typeof mod.storage.remove, 'function')
    })

    it('exports default as useLocalStorage', async () => {
      const mod = await import('./useLocalStorage.js')
      assert.strictEqual(mod.default, mod.useLocalStorage)
    })
  })

  // Note: Full localStorage functionality is tested in browser integration tests
  // since localStorage is a browser-only global that's difficult to mock in Node
})
