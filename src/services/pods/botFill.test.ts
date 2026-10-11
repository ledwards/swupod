import {test} from 'node:test'
import assert from 'node:assert/strict'
import {seatsToFill} from './botFill'

test('Fill with bots: every empty seat, highest first (host keeps seat 1)', () => {
  assert.deepEqual(seatsToFill(8, [1, 2, 3]), [8, 7, 6, 5, 4])
  assert.deepEqual(seatsToFill(8, [1, 5]), [8, 7, 6, 4, 3, 2])
  assert.deepEqual(seatsToFill(8, [1, 2, 3, 4, 5, 6, 7, 8]), [])
})
