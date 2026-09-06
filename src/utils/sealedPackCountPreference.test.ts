import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  SEALED_PACK_COUNT_PREFERENCE_KEY,
  readSealedPackCountPreference,
  saveSealedPackCountPreference,
} from './sealedPackCountPreference'
import {
  STANDARD_SEALED_PACKS_PER_PLAYER,
  COMPETITIVE_SEALED_PACKS_PER_PLAYER,
} from './sealedPodConfig'

// The 6-vs-8 pack choice reset to 6 on every visit; picking 8 should make 8
// the default from then on.

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  ;(globalThis as any).window = {}
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
  }
  return store
}

describe('sealed pack count preference', () => {
  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).localStorage
  })

  it('falls back to the caller default when nothing has been chosen', () => {
    installStorage()
    assert.strictEqual(readSealedPackCountPreference(), STANDARD_SEALED_PACKS_PER_PLAYER)
    assert.strictEqual(
      readSealedPackCountPreference(COMPETITIVE_SEALED_PACKS_PER_PLAYER),
      COMPETITIVE_SEALED_PACKS_PER_PLAYER
    )
  })

  it('remembers a chosen pack count across sessions', () => {
    const store = installStorage()
    saveSealedPackCountPreference(8)
    assert.strictEqual(store.get(SEALED_PACK_COUNT_PREFERENCE_KEY), '8')
    assert.strictEqual(readSealedPackCountPreference(), 8)
  })

  it('lets a later choice replace an earlier one', () => {
    installStorage()
    saveSealedPackCountPreference(8)
    saveSealedPackCountPreference(6)
    assert.strictEqual(readSealedPackCountPreference(COMPETITIVE_SEALED_PACKS_PER_PLAYER), 6)
  })

  it('never stores a value outside the 6/8 options', () => {
    const store = installStorage()
    assert.strictEqual(saveSealedPackCountPreference(7), null)
    assert.strictEqual(saveSealedPackCountPreference('lots'), null)
    assert.strictEqual(store.has(SEALED_PACK_COUNT_PREFERENCE_KEY), false)
  })

  it('ignores a corrupt stored value', () => {
    installStorage({ [SEALED_PACK_COUNT_PREFERENCE_KEY]: '99' })
    assert.strictEqual(readSealedPackCountPreference(), STANDARD_SEALED_PACKS_PER_PLAYER)
  })

  it('returns the caller default on the server', () => {
    delete (globalThis as any).window
    assert.strictEqual(readSealedPackCountPreference(8), 8)
  })
})
