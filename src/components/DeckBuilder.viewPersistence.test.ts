/**
 * Deck editor view-persistence wiring.
 *
 * The preference store itself is covered in
 * `src/utils/deckViewPreferences.test.ts`. These assertions guard the wiring in
 * DeckBuilder.tsx that a unit test of the store can't see: that the toggles the
 * player actually clicks go through the preference-saving setters, and that the
 * raw setters stay reserved for restoring saved state.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('./DeckBuilder.tsx', import.meta.url), 'utf8')

describe('DeckBuilder view persistence wiring', () => {
  it('seeds view mode and density from the cross-pool preferences', () => {
    assert.match(SRC, /readDeckViewPreferences/)
    assert.match(SRC, /const prefs = readDeckViewPreferences\(\)/)
    assert.match(SRC, /if \(prefs\.viewMode\) \{\s*setViewMode\(prefs\.viewMode\)/)
    assert.match(SRC, /if \(!savedPoolDensity && prefs\.poolCardDensity\)/)
    assert.match(SRC, /if \(!savedDeckDensity && prefs\.deckCardDensity\)/)
  })

  it('still prefers this pool\'s own saved view state over the global default', () => {
    assert.match(SRC, /savedViewMode = state\.viewMode \|\| null/)
    assert.match(SRC, /if \(savedViewMode\) \{[\s\S]*?setViewModeInitialized\(true\)\s*return/)
  })

  it('keeps the desktop arena default for a player who has never chosen', () => {
    assert.match(SRC, /window\.innerWidth >= 1024\) \{\s*\/\/[^\n]*\n\s*setViewMode\('arena'\)/)
  })

  it('saves every user-made view change as the new default', () => {
    assert.match(SRC, /chooseViewMode[\s\S]*?saveDeckViewPreference\(\{ viewMode: mode \}\)/)
    assert.match(SRC, /choosePoolCardDensity[\s\S]*?saveDeckViewPreference\(\{ poolCardDensity: density \}\)/)
    assert.match(SRC, /chooseDeckCardDensity[\s\S]*?saveDeckViewPreference\(\{ deckCardDensity: density \}\)/)
  })

  it('hands the preference-saving setters to the toggles and the context', () => {
    assert.match(SRC, /setViewMode: chooseViewMode/)
    assert.match(SRC, /setPoolCardDensity: choosePoolCardDensity/)
    assert.match(SRC, /setDeckCardDensity: chooseDeckCardDensity/)
    assert.doesNotMatch(SRC, /setViewMode=\{setViewMode\}/)
  })
})
