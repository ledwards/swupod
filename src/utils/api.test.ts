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

    it('should only include ASH for beta users after at least one real ASH card is synced', async () => {
      const sets = await fetchSets({ includeBeta: true })
      const setCodes = sets.map(s => s.code)

      if (hasRealCardsForSet('ASH')) {
        assert.ok(setCodes.includes('ASH'), 'ASH should be visible to beta users after spoiler sync')
      } else {
        assert.ok(!setCodes.includes('ASH'), 'ASH should stay hidden until a real ASH card is synced')
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
})

// Run tests
console.log('\n📡 Running API tests...\n')
