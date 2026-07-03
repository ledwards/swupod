// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getCompetitivePickTimeout, getLeaderPickTimeout } from './timers'

describe('timers', () => {
  describe('getCompetitivePickTimeout', () => {
    it('returns 60 for 14 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(14), 60)
    })

    it('returns 40 for 13 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(13), 40)
    })

    it('returns 40 for 12 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(12), 40)
    })

    it('returns 30 for 11 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(11), 30)
    })

    it('returns 30 for 10 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(10), 30)
    })

    it('returns 25 for 9 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(9), 25)
    })

    it('returns 25 for 8 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(8), 25)
    })

    it('returns 20 for 7 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(7), 20)
    })

    it('returns 15 for 6 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(6), 15)
    })

    it('returns 10 for 5 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(5), 10)
    })

    it('returns 10 for 4 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(4), 10)
    })

    it('returns 5 for 3 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(3), 5)
    })

    it('returns 5 for 2 cards remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(2), 5)
    })

    it('returns 0 for 1 card remaining', () => {
      assert.strictEqual(getCompetitivePickTimeout(1), 0)
    })

    it('returns 0 for unknown card count', () => {
      assert.strictEqual(getCompetitivePickTimeout(0), 0)
    })
  })

  describe('getLeaderPickTimeout', () => {
    it('returns 15 for 3 leaders remaining', () => {
      assert.strictEqual(getLeaderPickTimeout(3), 15)
    })

    it('returns 10 for 2 leaders remaining', () => {
      assert.strictEqual(getLeaderPickTimeout(2), 10)
    })

    it('returns 5 for 1 leader remaining', () => {
      assert.strictEqual(getLeaderPickTimeout(1), 5)
    })

    it('returns 0 for unknown leader count', () => {
      assert.strictEqual(getLeaderPickTimeout(0), 0)
    })
  })
})
