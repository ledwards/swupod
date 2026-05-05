// @ts-nocheck
/**
 * Tests for the card matcher service (U3).
 *
 * Spec: maps extracted rows from CV → cards in the in-app DB, disambiguating
 * by Name|Type|Subtitle, resolving variants to Normal.
 *
 * Run: node --import tsx/esm src/services/importPool/cardMatcher.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchExtractedRows } from './cardMatcher.ts'

// Synthetic card DB for tests — a stable shape we control rather than relying
// on cards.json (which changes when sets release).
const fixtureCards = [
  // Sabacc Dealer — single Normal variant (exact match case)
  { id: 'uuid-sabacc-normal', cardId: 'LAW-085', name: 'Sabacc Dealer', subtitle: null, type: 'Unit', set: 'LAW', variantType: 'Normal', aspects: ['Cunning'], isLeader: false, isBase: false },
  { id: 'uuid-sabacc-foil',   cardId: 'LAW-485', name: 'Sabacc Dealer', subtitle: null, type: 'Unit', set: 'LAW', variantType: 'Foil',   aspects: ['Cunning'], isLeader: false, isBase: false },

  // Han Solo — same name+type, two subtitles (ambiguous case)
  { id: 'uuid-han-prodigy',  cardId: 'LAW-010', name: 'Han Solo', subtitle: 'Reluctant Hero',  type: 'Unit', set: 'LAW', variantType: 'Normal', aspects: ['Heroism'], isLeader: false, isBase: false },
  { id: 'uuid-han-corellian', cardId: 'LAW-011', name: 'Han Solo', subtitle: 'Has His Moments', type: 'Unit', set: 'LAW', variantType: 'Normal', aspects: ['Heroism'], isLeader: false, isBase: false },

  // Han Solo Leader — same name, different type (so name-only collisions branch by type)
  { id: 'uuid-han-leader', cardId: 'LAW-001', name: 'Han Solo', subtitle: 'Audacious Smuggler', type: 'Leader', set: 'LAW', variantType: 'Normal', aspects: ['Heroism', 'Cunning'], isLeader: true, isBase: false },

  // Death Star Plans — typo target for fuzzy match (Levenshtein ≤ 2)
  { id: 'uuid-dsp-normal', cardId: 'LAW-200', name: 'Death Star Plans', subtitle: null, type: 'Event', set: 'LAW', variantType: 'Normal', aspects: ['Vigilance'], isLeader: false, isBase: false },

  // Echo Base — to ensure cross-set matches don't leak
  { id: 'uuid-echo-shd', cardId: 'SHD-099', name: 'Echo Base', subtitle: null, type: 'Base', set: 'SHD', variantType: 'Normal', aspects: ['Vigilance'], isLeader: false, isBase: true },
]

describe('matchExtractedRows', () => {
  describe('happy path: exact Name|Type|Subtitle match', () => {
    it('returns the Normal variant with confidence "exact"', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Sabacc Dealer', type: 'Unit', subtitle: null, poolQty: 2, deckQty: 1 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result.length, 1)
      assert.equal(result[0].confidence, 'exact')
      assert.equal(result[0].matched?.id, 'uuid-sabacc-normal')
      assert.equal(result[0].matched?.variantType, 'Normal')
      assert.deepEqual(result[0].candidates, [])
    })

    it('matches case-insensitively for resilience to OCR caps drift', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'sabacc dealer', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result[0].confidence, 'exact')
      assert.equal(result[0].matched?.id, 'uuid-sabacc-normal')
    })

    it('preserves extracted poolQty/deckQty in the output', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Sabacc Dealer', type: 'Unit', subtitle: null, poolQty: 4, deckQty: 3 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result[0].extracted.poolQty, 4)
      assert.equal(result[0].extracted.deckQty, 3)
    })
  })

  describe('ambiguous: same Name|Type, missing or unparseable subtitle', () => {
    it('returns confidence "ambiguous" with both candidates when subtitle is null', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Han Solo', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 1 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result[0].confidence, 'ambiguous')
      assert.equal(result[0].matched, null)
      assert.equal(result[0].candidates.length, 2)
      const candidateIds = result[0].candidates.map(c => c.id).sort()
      assert.deepEqual(candidateIds, ['uuid-han-corellian', 'uuid-han-prodigy'])
    })

    it('disambiguates correctly when subtitle IS provided', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Han Solo', type: 'Unit', subtitle: 'Has His Moments', poolQty: 1, deckQty: 1 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result[0].confidence, 'exact')
      assert.equal(result[0].matched?.id, 'uuid-han-corellian')
    })

    it('respects type — Han Solo Leader is distinct from Han Solo Unit', () => {
      const leaderResult = matchExtractedRows({
        rows: [{ name: 'Han Solo', type: 'Leader', subtitle: 'Audacious Smuggler', poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(leaderResult[0].confidence, 'exact')
      assert.equal(leaderResult[0].matched?.id, 'uuid-han-leader')
      assert.equal(leaderResult[0].matched?.isLeader, true)
    })
  })

  describe('fuzzy: typos within Levenshtein distance 2', () => {
    it('matches "Sabaac Dealer" → "Sabacc Dealer" with confidence "fuzzy"', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Sabaac Dealer', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result[0].confidence, 'fuzzy')
      assert.equal(result[0].matched?.id, 'uuid-sabacc-normal')
    })

    it('returns "unmatched" when distance exceeds 2', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Totally Different Card', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result[0].confidence, 'unmatched')
      assert.equal(result[0].matched, null)
      assert.equal(result[0].candidates.length, 0)
    })
  })

  describe('variant resolution', () => {
    it('always returns the Normal variant even if a Foil id appears', () => {
      // The matcher must never return a non-Normal variant. Ensures variant collapse
      // before the row reaches pool assembly.
      const result = matchExtractedRows({
        rows: [{ name: 'Sabacc Dealer', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })
      assert.equal(result[0].matched?.variantType, 'Normal')
    })
  })

  describe('cross-set isolation', () => {
    it('does not match cards from a different set when scoped to LAW', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Echo Base', type: 'Base', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'LAW'), // Echo Base is SHD, scoped to LAW
      })

      assert.equal(result[0].confidence, 'unmatched')
      assert.equal(result[0].matched, null)
    })

    it('matches when the right set is scoped', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Echo Base', type: 'Base', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: fixtureCards.filter(c => c.set === 'SHD'),
      })

      assert.equal(result[0].confidence, 'exact')
      assert.equal(result[0].matched?.id, 'uuid-echo-shd')
    })
  })

  describe('error paths', () => {
    it('returns all rows as unmatched when card list is empty', () => {
      const result = matchExtractedRows({
        rows: [{ name: 'Sabacc Dealer', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 0 }],
        cards: [],
      })

      assert.equal(result.length, 1)
      assert.equal(result[0].confidence, 'unmatched')
    })

    it('returns empty array when rows is empty (no crash)', () => {
      const result = matchExtractedRows({ rows: [], cards: fixtureCards })
      assert.deepEqual(result, [])
    })
  })

  describe('multiple rows', () => {
    it('preserves row order in the output', () => {
      const result = matchExtractedRows({
        rows: [
          { name: 'Death Star Plans', type: 'Event', subtitle: null, poolQty: 1, deckQty: 1 },
          { name: 'Sabacc Dealer', type: 'Unit', subtitle: null, poolQty: 2, deckQty: 1 },
          { name: 'Nonexistent', type: 'Unit', subtitle: null, poolQty: 1, deckQty: 0 },
        ],
        cards: fixtureCards.filter(c => c.set === 'LAW'),
      })

      assert.equal(result.length, 3)
      assert.equal(result[0].matched?.name, 'Death Star Plans')
      assert.equal(result[1].matched?.name, 'Sabacc Dealer')
      assert.equal(result[2].confidence, 'unmatched')
    })
  })
})
