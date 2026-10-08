// Tests for the set picker's display order.
//
// SPEC (mobile): the picker collapses to a single column at <= 900px, so the
// latest-sets row and the grid below it read as one list. That list runs most
// recent to least recent — set 8, 7, 6, ... 1 — with no exceptions.
//
// SPEC (desktop): a fixed grid order of [7, 8, 9, 4, 5, 6, 1, 2, 3], newest
// row on top.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getSetNumber,
  sortSetsForDisplay,
  splitSetsForDisplay,
  LATEST_SET_THRESHOLD,
} from './setSelectionOrder'

// The order the sets API happens to return them in — oldest first. The picker
// must not depend on it.
const FETCHED = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH'].map((code) => ({ code }))

/** The order a user actually sees: latest row first, then the grid below it. */
const displayedOrder = (sets: { code: string }[], vertical: boolean): string[] => {
  const { latest, regular } = splitSetsForDisplay(sets, vertical)
  return [...latest, ...regular].map((s) => s.code)
}

describe('setSelectionOrder — set picker display order', () => {
  describe('getSetNumber', () => {
    it('SPEC: numbers each released set in release order', () => {
      assert.strictEqual(getSetNumber('SOR'), 1)
      assert.strictEqual(getSetNumber('SEC'), 6)
      assert.strictEqual(getSetNumber('LAW'), 7)
      assert.strictEqual(getSetNumber('ASH'), 8)
    })

    it('SPEC: an unknown set code numbers highest, so it reads as the newest', () => {
      assert.strictEqual(getSetNumber('ZZZ'), 999)
    })
  })

  describe('mobile — single column', () => {
    it('SPEC: the whole column runs most recent to least recent', () => {
      assert.deepStrictEqual(
        displayedOrder(FETCHED, true),
        ['ASH', 'LAW', 'SEC', 'LOF', 'JTL', 'TWI', 'SHD', 'SOR'],
      )
    })

    it('SPEC: the newest set is first and the oldest is last', () => {
      const order = displayedOrder(FETCHED, true)
      assert.strictEqual(order[0], 'ASH')
      assert.strictEqual(order[order.length - 1], 'SOR')
    })

    it('SPEC: order is strictly descending, so no set number repeats or rises', () => {
      const numbers = displayedOrder(FETCHED, true).map(getSetNumber)
      for (let i = 1; i < numbers.length; i++) {
        assert.ok(
          numbers[i] < numbers[i - 1],
          `SPEC: descending order, but ${numbers[i - 1]} is followed by ${numbers[i]}`,
        )
      }
    })

    it('SPEC: order does not depend on the order the API returned', () => {
      const shuffled = [...FETCHED].reverse()
      assert.deepStrictEqual(displayedOrder(shuffled, true), displayedOrder(FETCHED, true))
    })

    it('SPEC: holds when a future set 9 arrives', () => {
      const withNine = [...FETCHED, { code: 'NEW' }]
      // 'NEW' is unknown (999) so it leads; the released sets stay descending.
      const numbers = displayedOrder(withNine, true).map(getSetNumber)
      for (let i = 1; i < numbers.length; i++) {
        assert.ok(numbers[i] < numbers[i - 1], `SPEC: descending, got ${numbers}`)
      }
    })
  })

  describe('desktop — grid', () => {
    it('SPEC: the latest row holds sets 7 and up, in ascending release order', () => {
      const { latest } = splitSetsForDisplay(FETCHED, false)
      assert.deepStrictEqual(latest.map((s) => s.code), ['LAW', 'ASH'])
    })

    it('SPEC: the grid below follows the fixed [4, 5, 6, 1, 2, 3] order', () => {
      const { regular } = splitSetsForDisplay(FETCHED, false)
      assert.deepStrictEqual(regular.map((s) => s.code), ['JTL', 'LOF', 'SEC', 'SOR', 'SHD', 'TWI'])
    })

    it('SPEC: sets below the threshold never appear in the latest row', () => {
      const { latest, regular } = splitSetsForDisplay(FETCHED, false)
      assert.ok(latest.every((s) => getSetNumber(s.code) >= LATEST_SET_THRESHOLD))
      assert.ok(regular.every((s) => getSetNumber(s.code) < LATEST_SET_THRESHOLD))
    })
  })

  describe('sortSetsForDisplay', () => {
    it('SPEC: does not mutate its input', () => {
      const input = [...FETCHED]
      const snapshot = input.map((s) => s.code)
      sortSetsForDisplay(input, true)
      assert.deepStrictEqual(input.map((s) => s.code), snapshot)
    })
  })
})
