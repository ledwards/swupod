// @ts-nocheck
// Tests for API utilities - set filtering
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { fetchSets } from './api'
import { hasRealCardsForSet } from './cardData'

describe('fetchSets', () => {
  describe('set filtering', () => {
    it('should return released non-beta sets by default', async () => {
      const sets = await fetchSets()
      const setCodes = sets.map(s => s.code)

      assert.ok(setCodes.includes('LAW'), 'LAW should be included')
      assert.ok(setCodes.includes('SOR'), 'SOR should be included')
      assert.ok(setCodes.includes('SEC'), 'SEC should be included')
      assert.ok(sets.length >= 7, 'Should have at least the first 7 sets')
      assert.ok(!setCodes.includes('ASH'), 'ASH should stay hidden by default while it is beta')
    })

    it('should include LAW with prereleaseDate', async () => {
      const sets = await fetchSets()
      const lawSet = sets.find(s => s.code === 'LAW')

      assert.ok(lawSet, 'LAW set should exist')
      assert.strictEqual(lawSet.prereleaseDate, '2026-03-06', 'LAW should have prereleaseDate')
      assert.strictEqual(lawSet.name, 'A Lawless Time', 'LAW should have correct name')
    })

    it('should have prereleaseDate for all sets', async () => {
      const sets = await fetchSets()

      for (const set of sets) {
        assert.ok(set.prereleaseDate, `${set.code} should have prereleaseDate`)
      }
    })

    it('should hide ASH by default (beta gate)', async () => {
      const sets = await fetchSets()
      assert.ok(!sets.find(s => s.code === 'ASH'), 'ASH should not be visible by default')
    })

    it('should only include ASH for beta users after at least one real ASH card is synced', async () => {
      const sets = await fetchSets({ includeBeta: true })
      const setCodes = sets.map(s => s.code)

      if (hasRealCardsForSet('ASH')) {
        assert.ok(setCodes.includes('ASH'), 'ASH should be visible to beta users after spoiler sync')
      } else {
        assert.ok(!setCodes.includes('ASH'), 'ASH should stay hidden until a real ASH card is synced')
      }
    })

    it('should only include ASH carbonite after at least one real ASH card is synced', async () => {
      const sets = await fetchSets({ includeBeta: true, includeCarbonite: true })
      const setCodes = sets.map(s => s.code)

      if (hasRealCardsForSet('ASH')) {
        assert.ok(setCodes.includes('ASH-CB'), 'ASH-CB should be visible when ASH has real card data')
      } else {
        assert.ok(!setCodes.includes('ASH-CB'), 'ASH-CB should remain hidden until a real ASH card is synced')
      }
    })
  })

  describe('set data structure', () => {
    it('should include imageUrl for all sets', async () => {
      const sets = await fetchSets()

      for (const set of sets) {
        assert.ok(set.imageUrl, `${set.code} should have imageUrl`)
      }
    })

    it('should include code, name, and releaseDate for all sets', async () => {
      const sets = await fetchSets()

      for (const set of sets) {
        assert.ok(set.code, 'Set should have code')
        assert.ok(set.name, 'Set should have name')
        assert.ok(set.releaseDate, 'Set should have releaseDate')
      }
    })

    it('should return sets in chronological order', async () => {
      const sets = await fetchSets()
      const releaseDates = sets.map(s => new Date(s.releaseDate))

      for (let i = 1; i < releaseDates.length; i++) {
        assert.ok(
          releaseDates[i] >= releaseDates[i - 1],
          'Sets should be in chronological order'
        )
      }
    })
  })

  describe('peekUnreleased option (U3)', () => {
    it('SPEC: appends the next unreleased set as a comingSoon teaser when peekUnreleased=true', async () => {
      // Today (2026-05-26) ASH is unreleased. fetchSets() filters ASH out
      // via isSetVisibleInCatalog (hasRealCardsForSet gate), so the only
      // path it can appear is the setConfigs-sourced peek injection.
      const sets = await fetchSets({ peekUnreleased: true })
      const ash = sets.find(s => s.code === 'ASH')
      assert.ok(ash, 'ASH teaser should be appended by peekUnreleased')
      assert.strictEqual(ash.comingSoon, true, 'appended ASH should carry comingSoon: true')
      assert.strictEqual(ash.name, 'Ashes of the Empire')
      assert.ok(ash.imageUrl, 'ASH teaser should have an imageUrl (from getPackArtUrl)')
    })

    it('SPEC: does NOT append a teaser when peekUnreleased is omitted', async () => {
      const sets = await fetchSets()
      assert.ok(!sets.some(s => s.comingSoon), 'no teaser should appear without peekUnreleased')
    })

    it('SPEC: does NOT append a teaser when peekUnreleased is false', async () => {
      const sets = await fetchSets({ peekUnreleased: false })
      assert.ok(!sets.some(s => s.comingSoon), 'no teaser should appear when peekUnreleased=false')
    })

    it('SPEC: does NOT duplicate the upcoming set when it is already in the catalog', async () => {
      // When includeBeta=true and ASH has real cards synced, ASH appears
      // through the normal catalog path. The peek injection must skip it
      // rather than rendering ASH twice.
      const sets = await fetchSets({ includeBeta: true, peekUnreleased: true })
      const ashEntries = sets.filter(s => s.code === 'ASH')
      assert.ok(ashEntries.length <= 1, `ASH should appear at most once, got ${ashEntries.length}`)
    })

    it('SPEC: teaser entry surfaces prereleaseDate and releaseDate from setConfigs', async () => {
      const sets = await fetchSets({ peekUnreleased: true })
      const ash = sets.find(s => s.code === 'ASH' && s.comingSoon)
      if (ash) {
        assert.strictEqual(ash.prereleaseDate, '2026-07-10')
        assert.strictEqual(ash.releaseDate, '2026-07-17')
      }
    })
  })
})

// Run tests
console.log('\n📡 Running API tests...\n')
