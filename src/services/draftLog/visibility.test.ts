import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { podViewableSeats } from './visibility'

// Spec (2026-10-12): the host flips the whole pod public or private.
// Public: everyone sees all. Private: host sees all, a drafter sees only their own seat, outsiders nothing.
const seats = [
  { seatNumber: 1, userId: 'host' },
  { seatNumber: 2, userId: 'amy' },
  { seatNumber: 3, userId: 'bot-1' },
  { seatNumber: 4, userId: 'ben' },
]

describe('podViewableSeats', () => {
  it('public: every seat, even signed out', () => {
    assert.deepEqual(podViewableSeats({ isPublic: true, hostId: 'host', viewerId: null, seats }), [1, 2, 3, 4])
  })
  it('private: the host sees every seat', () => {
    assert.deepEqual(podViewableSeats({ isPublic: false, hostId: 'host', viewerId: 'host', seats }), [1, 2, 3, 4])
  })
  it('private: a drafter sees only their own seat (not bots, not other drafters)', () => {
    assert.deepEqual(podViewableSeats({ isPublic: false, hostId: 'host', viewerId: 'amy', seats }), [2])
  })
  it('private: an outsider and a signed-out viewer see nothing', () => {
    assert.deepEqual(podViewableSeats({ isPublic: false, hostId: 'host', viewerId: 'stranger', seats }), [])
    assert.deepEqual(podViewableSeats({ isPublic: false, hostId: 'host', viewerId: null, seats }), [])
  })
})
