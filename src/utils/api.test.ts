// @ts-nocheck
// Tests for API utilities - set filtering
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { fetchSets } from './api'

describe('fetchSets', () => {
  describe('set filtering', () => {
    it('should return all 7 sets by default', async () => {
      const sets = await fetchSets()
      const setCodes = sets.map(s => s.code)

      assert.ok(setCodes.includes('LAW'), 'LAW should be included')
      assert.ok(setCodes.includes('SOR'), 'SOR should be included')
      assert.ok(setCodes.includes('SEC'), 'SEC should be included')
      assert.strictEqual(sets.length, 7, 'Should have 7 sets')
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

    it('should still hide ASH with includeBeta:true while card data is empty', async () => {
      // Card-count gate: a set with zero real cards never displays, even when
      // the beta date gate would let it through.
      const sets = await fetchSets({ includeBeta: true })
      assert.ok(!sets.find(s => s.code === 'ASH'), 'ASH should remain hidden until cards exist')
    })

    it('should still hide ASH-CB with includeBeta+includeCarbonite while cards are empty', async () => {
      const sets = await fetchSets({ includeBeta: true, includeCarbonite: true })
      assert.ok(!sets.find(s => s.code === 'ASH'), 'ASH should remain hidden until cards exist')
      assert.ok(!sets.find(s => s.code === 'ASH-CB'), 'ASH-CB should remain hidden until cards exist')
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
