// @ts-nocheck
// Tests for API utilities - set filtering
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { fetchSets, isSetBeta } from './api'
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
      // Time-independent form of the beta gate: whatever today's date is,
      // no set still before its prereleaseDate may appear by default.
      for (const set of sets) {
        assert.ok(!isSetBeta(set), `${set.code} is still beta (before prereleaseDate) and should be hidden by default`)
      }
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

    // Beta status is date-derived (isSetBeta: now < prereleaseDate), so
    // these tests pin the clock around ASH's prereleaseDate (2026-07-10)
    // instead of assuming ASH is beta "today" — that assumption expired
    // the day ASH graduated and broke the suite.
    it('should hide a set by default while it is beta (before prereleaseDate)', async (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-09T00:00:00Z') })
      const sets = await fetchSets()
      assert.ok(!sets.find(s => s.code === 'ASH'), 'ASH should not be visible by default before its prereleaseDate')
    })

    it('should surface a set by default once its prereleaseDate arrives (beta graduation)', async (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-10T00:00:00Z') })
      const sets = await fetchSets()
      assert.ok(sets.find(s => s.code === 'ASH'), 'ASH should be visible by default from its prereleaseDate onward')
    })

    it('SPEC: ASH visible to beta users only after at least one real card is synced', async () => {
      // Gate: hasRealCardsForSet('ASH'). Until a single real ASH card
      // lands, all sub-conversion surfaces (picker teaser, homepage
      // banner, pod banner) stay dark. The instant the first real card
      // is synced, beta users get ASH as a normal beta-badged card and
      // non-subs get the Coming Soon teaser.
      const sets = await fetchSets({ includeBeta: true })
      const setCodes = sets.map(s => s.code)
      if (hasRealCardsForSet('ASH')) {
        assert.ok(setCodes.includes('ASH'), 'ASH should be visible after spoiler sync')
      } else {
        assert.ok(!setCodes.includes('ASH'), 'ASH should stay hidden until first real card lands')
      }
    })

    it('SPEC: ASH-CB visible to beta users only after at least one real card is synced', async () => {
      const sets = await fetchSets({ includeBeta: true, includeCarbonite: true })
      const setCodes = sets.map(s => s.code)
      if (hasRealCardsForSet('ASH')) {
        assert.ok(setCodes.includes('ASH-CB'), 'ASH-CB should be visible after spoiler sync')
      } else {
        assert.ok(!setCodes.includes('ASH-CB'), 'ASH-CB should stay hidden until first real card lands')
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
    it('SPEC: appends the next unreleased set as a comingSoon teaser ONLY after first real card lands', async (t) => {
      // Gate: hasRealCardsForSet. Before spoiler sync peekUnreleased
      // returns nothing; after it, ASH appears as a teaser. Pin the clock
      // before ASH's prereleaseDate (2026-07-10) — from that date on ASH
      // enters the catalog normally and no teaser is appended.
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-09T00:00:00Z') })
      const sets = await fetchSets({ peekUnreleased: true })
      const ash = sets.find(s => s.code === 'ASH')
      if (hasRealCardsForSet('ASH')) {
        assert.ok(ash, 'ASH teaser should appear after spoiler sync')
        assert.strictEqual(ash.comingSoon, true, 'appended ASH should carry comingSoon: true')
        assert.strictEqual(ash.name, 'Ashes of the Empire')
        assert.ok(ash.imageUrl, 'ASH teaser should have an imageUrl (from getPackArtUrl)')
      } else {
        assert.ok(!ash, 'ASH teaser should stay hidden until first real card lands')
      }
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
      // When ASH has real cards AND includeBeta=true, ASH appears once
      // through the normal catalog path. The peek injection skips it
      // rather than rendering ASH twice.
      const sets = await fetchSets({ includeBeta: true, peekUnreleased: true })
      const ashEntries = sets.filter(s => s.code === 'ASH')
      assert.ok(ashEntries.length <= 1, `ASH should appear at most once, got ${ashEntries.length}`)
    })

    it('SPEC: teaser entry surfaces prereleaseDate and releaseDate from setConfigs', async (t) => {
      // Pinned before ASH's prereleaseDate so the teaser path actually runs.
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-09T00:00:00Z') })
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
