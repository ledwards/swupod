import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  DECK_VIEW_PREFERENCES_KEY,
  parseDeckViewPreferences,
  readDeckViewPreferences,
  saveDeckViewPreference,
} from './deckViewPreferences'

// Regression: view mode and card density were only ever stored per pool
// (deckBuilderUI_<key>), so a player who always builds in Playmat with large
// cards got the defaults back on every new pool and every new session.

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

describe('parseDeckViewPreferences', () => {
  it('keeps recognized view mode and densities', () => {
    const prefs = parseDeckViewPreferences(JSON.stringify({
      viewMode: 'list',
      poolCardDensity: 'large',
      deckCardDensity: 'medium',
    }))
    assert.deepStrictEqual(prefs, {
      viewMode: 'list',
      poolCardDensity: 'large',
      deckCardDensity: 'medium',
    })
  })

  it('drops unknown values instead of restoring a broken view', () => {
    const prefs = parseDeckViewPreferences(JSON.stringify({
      viewMode: 'hologram',
      poolCardDensity: 'enormous',
      deckCardDensity: 'small',
    }))
    assert.deepStrictEqual(prefs, { deckCardDensity: 'small' })
  })

  it('returns empty preferences for missing or corrupt storage', () => {
    assert.deepStrictEqual(parseDeckViewPreferences(null), {})
    assert.deepStrictEqual(parseDeckViewPreferences('not json'), {})
    assert.deepStrictEqual(parseDeckViewPreferences('[1,2,3]'), {})
  })
})

describe('deck view preferences storage', () => {
  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).localStorage
  })

  it('reads nothing on the server rather than throwing', () => {
    delete (globalThis as any).window
    assert.deepStrictEqual(readDeckViewPreferences(), {})
  })

  it('remembers a choice so it becomes the next session default', () => {
    const store = installStorage()
    saveDeckViewPreference({ viewMode: 'arena' })
    assert.deepStrictEqual(readDeckViewPreferences(), { viewMode: 'arena' })
    assert.strictEqual(
      store.get(DECK_VIEW_PREFERENCES_KEY),
      JSON.stringify({ viewMode: 'arena' })
    )
  })

  it('merges a new choice without clearing the others', () => {
    installStorage()
    saveDeckViewPreference({ viewMode: 'grid' })
    saveDeckViewPreference({ poolCardDensity: 'large' })
    saveDeckViewPreference({ deckCardDensity: 'medium' })
    assert.deepStrictEqual(readDeckViewPreferences(), {
      viewMode: 'grid',
      poolCardDensity: 'large',
      deckCardDensity: 'medium',
    })
  })

  it('overwrites an earlier choice — the newest change is the new default', () => {
    installStorage()
    saveDeckViewPreference({ viewMode: 'arena' })
    saveDeckViewPreference({ viewMode: 'list' })
    assert.strictEqual(readDeckViewPreferences().viewMode, 'list')
  })

  it('ignores an invalid choice rather than persisting it', () => {
    installStorage()
    saveDeckViewPreference({ viewMode: 'grid' })
    saveDeckViewPreference({ viewMode: 'nonsense' as never })
    assert.strictEqual(readDeckViewPreferences().viewMode, 'grid')
  })

  it('survives corrupt stored preferences', () => {
    installStorage({ [DECK_VIEW_PREFERENCES_KEY]: '{{{' })
    assert.deepStrictEqual(readDeckViewPreferences(), {})
    saveDeckViewPreference({ viewMode: 'arena' })
    assert.deepStrictEqual(readDeckViewPreferences(), { viewMode: 'arena' })
  })
})
