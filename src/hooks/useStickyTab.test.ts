import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Behavior is asserted against the (comment-stripped) source, matching the
// convention used by src/components/YourStats/index.test.tsx — this codebase
// has no runtime React/DOM test environment for hooks.
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return out
}

const SRC = stripComments(readFileSync(join(__dirname, 'useStickyTab.ts'), 'utf8'))

describe('useStickyTab', () => {
  describe('module exports', () => {
    it('exports useStickyTab as a function, with a matching default export', async () => {
      const mod = await import('./useStickyTab.js')
      assert.strictEqual(typeof mod.useStickyTab, 'function')
      assert.strictEqual(mod.default, mod.useStickyTab)
    })
  })

  describe('deep-links via the URL hash, never a query param', () => {
    // The product requirement: tab deep-linking uses anchor tags (#meta), not
    // query params (?tab=meta). select() writes the hash and must never set a
    // query param for the active tab.
    it('writes the active tab into the URL hash via the History API', () => {
      assert.match(SRC, /url\.hash\s*=/)
      assert.match(SRC, /window\.history\.replaceState/)
    })

    it('never writes the active tab to a query param', () => {
      // Old behavior used url.searchParams.set(param, v) — that must be gone.
      assert.doesNotMatch(SRC, /searchParams\.set\s*\(/)
    })

    it('adopts external hash changes (manual edit, anchor link, browser nav)', () => {
      assert.match(SRC, /addEventListener\(\s*['"]hashchange['"]/)
    })
  })

  describe('persistence + restore', () => {
    it('mirrors the active tab into localStorage when a storageKey is given', () => {
      assert.match(SRC, /localStorage\.setItem\(\s*storageKey/)
      assert.match(SRC, /localStorage\.getItem\(\s*storageKey/)
    })

    it('seeds from the default value so SSR and first client render agree', () => {
      assert.match(SRC, /useState<T>\(\s*defaultValue\s*\)/)
    })
  })

  describe('options', () => {
    it('supports url:false for secondary subtabs (localStorage only, no hash)', () => {
      // When url is false the hashchange listener and all hash writes are skipped.
      assert.match(SRC, /opts\?\.url/)
      assert.match(SRC, /if\s*\(\s*!useUrl\s*\)\s*return/)
    })

    it('supports legacyParam to upgrade old ?param= bookmarks to #hash', () => {
      assert.match(SRC, /legacyParam/)
      assert.match(SRC, /searchParams\.get\(\s*legacyParam\s*\)/)
      assert.match(SRC, /searchParams\.delete\(\s*legacyParam\s*\)/)
    })
  })
})
