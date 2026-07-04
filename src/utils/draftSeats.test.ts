import { describe, it } from 'node:test'
import { strictEqual } from 'node:assert'
import { findNextAvailableSeat } from './draftSeats'

describe('findNextAvailableSeat', () => {
  it('fills the LOW gap a host + bots leave (regression: duplicate seat_number)', () => {
    // Host holds seat 1; 6 bots fill seats 8,7,6,5,4,3 (bots fill top-down).
    // The only free seat is 2 — NOT players.length + 1 (= 8, an occupied bot
    // seat), which is what produced the duplicate `seat-8` key + invisible join.
    const taken = [1, 3, 4, 5, 6, 7, 8]
    strictEqual(findNextAvailableSeat(taken, 8), 2)
  })

  it('returns 1 for an empty pod', () => {
    strictEqual(findNextAvailableSeat([], 8), 1)
  })

  it('returns the next contiguous seat when seats are packed low', () => {
    strictEqual(findNextAvailableSeat([1, 2, 3], 8), 4)
  })

  it('fills the lowest gap when a mid player has left', () => {
    // Someone in seat 3 left; the next joiner should reuse seat 3, not append.
    strictEqual(findNextAvailableSeat([1, 2, 4, 5], 8), 3)
  })

  it('returns null when every seat is taken (full)', () => {
    strictEqual(findNextAvailableSeat([1, 2, 3, 4, 5, 6, 7, 8], 8), null)
  })

  it('ignores out-of-range / duplicate taken entries and is order-independent', () => {
    // Defensive: pre-existing corrupt data (a duplicate seat 8, an out-of-range
    // 99) must not break the search; seat 2 is still the lowest free seat.
    strictEqual(findNextAvailableSeat([8, 1, 8, 99, 3, 4, 5, 6, 7], 8), 2)
  })

  it('respects max_players smaller than the highest taken seat', () => {
    strictEqual(findNextAvailableSeat([1], 2), 2)
    strictEqual(findNextAvailableSeat([1, 2], 2), null)
  })
})
