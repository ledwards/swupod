/**
 * Tests for pool tracking logic
 *
 * These tests verify that the pack format handling works correctly.
 * The bug was that packs in object format { cards: [...] } were not
 * being tracked because the code checked `if (Array.isArray(pack))`
 * which fails for objects.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// Extract the tracking record building logic for testing
// This mirrors the logic in route.ts

interface Card {
  id: string
  name: string
  type?: string
  variantType?: string
  isLeader?: boolean
  isShowcase?: boolean
}

interface Pack {
  cards: Card[]
}

interface TrackingOptions {
  sourceType: string
  userId: string
  packIndex?: number | null
}

interface TrackingRecord {
  card: Card
  options: TrackingOptions
}

function buildTrackingRecordsBuggy(
  packs: (Card[] | Pack)[] | undefined,
  cards: Card[] | undefined,
  options: TrackingOptions
): TrackingRecord[] {
  // OLD BUGGY CODE - checks Array.isArray(pack) which fails for objects
  const trackingRecords: TrackingRecord[] = []
  if (packs && Array.isArray(packs)) {
    packs.forEach((pack, packIndex) => {
      if (Array.isArray(pack)) {  // BUG: This fails for { cards: [...] } objects!
        pack.forEach(card => {
          trackingRecords.push({
            card,
            options: { ...options, packIndex }
          })
        })
      }
    })
  }
  // Fallback to flat cards array
  if (trackingRecords.length === 0 && cards && Array.isArray(cards)) {
    cards.forEach(card => {
      trackingRecords.push({
        card,
        options: { ...options, packIndex: null }
      })
    })
  }
  return trackingRecords
}

function buildTrackingRecordsFixed(
  packs: (Card[] | Pack)[] | undefined,
  cards: Card[] | undefined,
  options: TrackingOptions
): TrackingRecord[] {
  // FIXED CODE - handles both array and object pack formats
  const trackingRecords: TrackingRecord[] = []
  if (packs && Array.isArray(packs)) {
    packs.forEach((pack, packIndex) => {
      // Support both formats: pack as array or pack as {cards: [...]} object
      const packCards = Array.isArray(pack) ? pack : (pack as Pack).cards
      if (Array.isArray(packCards)) {
        packCards.forEach(card => {
          trackingRecords.push({
            card,
            options: { ...options, packIndex }
          })
        })
      }
    })
  }
  // Fallback to flat cards array (only if packs didn't work)
  if (trackingRecords.length === 0 && cards && Array.isArray(cards)) {
    cards.forEach(card => {
      trackingRecords.push({
        card,
        options: { ...options, packIndex: null }
      })
    })
  }
  return trackingRecords
}

describe('Pool tracking pack format handling', () => {
  const testOptions: TrackingOptions = { sourceType: 'sealed', userId: 'test-user' }

  // Test data in OBJECT format (what generateSealedPod returns)
  const objectFormatPacks: Pack[] = [
    { cards: [{ id: '1', name: 'Card 1' }, { id: '2', name: 'Card 2' }] },
    { cards: [{ id: '3', name: 'Card 3' }, { id: '4', name: 'Card 4' }] }
  ]
  const objectFormatCards = objectFormatPacks.flatMap(p => p.cards)

  // Test data in ARRAY format (what old draft code produced)
  const arrayFormatPacks: Card[][] = [
    [{ id: '1', name: 'Card 1' }, { id: '2', name: 'Card 2' }],
    [{ id: '3', name: 'Card 3' }, { id: '4', name: 'Card 4' }]
  ]
  const arrayFormatCards = arrayFormatPacks.flat()

  describe('BUGGY code behavior', () => {
    it('works with array format packs (old draft format)', () => {
      const records = buildTrackingRecordsBuggy(arrayFormatPacks, arrayFormatCards, testOptions)

      assert.strictEqual(records.length, 4, 'Should track all 4 cards')
      assert.strictEqual(records[0].options.packIndex, 0, 'First card should have packIndex 0')
      assert.strictEqual(records[2].options.packIndex, 1, 'Third card should have packIndex 1')
    })

    it('FAILS with object format packs - falls back to flat cards without packIndex', () => {
      const records = buildTrackingRecordsBuggy(objectFormatPacks, objectFormatCards, testOptions)

      // BUG: With object format, the packs loop produces nothing because
      // Array.isArray({ cards: [...] }) === false
      // So it falls back to the flat cards array, losing packIndex
      assert.strictEqual(records.length, 4, 'Falls back to flat cards')
      assert.strictEqual(records[0].options.packIndex, null, 'BUG: packIndex is null!')
      assert.strictEqual(records[2].options.packIndex, null, 'BUG: packIndex is null!')
    })
  })

  describe('FIXED code behavior', () => {
    it('works with array format packs', () => {
      const records = buildTrackingRecordsFixed(arrayFormatPacks, arrayFormatCards, testOptions)

      assert.strictEqual(records.length, 4, 'Should track all 4 cards')
      assert.strictEqual(records[0].options.packIndex, 0, 'First card should have packIndex 0')
      assert.strictEqual(records[2].options.packIndex, 1, 'Third card should have packIndex 1')
    })

    it('works with object format packs (the fix!)', () => {
      const records = buildTrackingRecordsFixed(objectFormatPacks, objectFormatCards, testOptions)

      assert.strictEqual(records.length, 4, 'Should track all 4 cards')
      assert.strictEqual(records[0].options.packIndex, 0, 'First card should have packIndex 0')
      assert.strictEqual(records[2].options.packIndex, 1, 'Third card should have packIndex 1')
    })
  })

  describe('Showcase tracking specifically', () => {
    const packsWithShowcase: Pack[] = [
      {
        cards: [
          { id: '1', name: 'Regular Card', type: 'Unit', variantType: 'Normal' },
          { id: '2', name: 'Director Krennic', type: 'Leader', variantType: 'Showcase', isLeader: true, isShowcase: true }
        ]
      }
    ]
    const cardsFlat = packsWithShowcase.flatMap(p => p.cards)

    it('BUGGY: showcase leader gets tracked but without packIndex', () => {
      const records = buildTrackingRecordsBuggy(packsWithShowcase, cardsFlat, testOptions)

      const showcaseRecord = records.find(r => r.card.isShowcase)
      assert.ok(showcaseRecord, 'Showcase should be in records')
      assert.strictEqual(showcaseRecord!.options.packIndex, null, 'BUG: packIndex lost')
    })

    it('FIXED: showcase leader gets tracked WITH packIndex', () => {
      const records = buildTrackingRecordsFixed(packsWithShowcase, cardsFlat, testOptions)

      const showcaseRecord = records.find(r => r.card.isShowcase)
      assert.ok(showcaseRecord, 'Showcase should be in records')
      assert.strictEqual(showcaseRecord!.options.packIndex, 0, 'packIndex preserved')
    })
  })
})
