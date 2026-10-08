import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTO_PICK_REVEAL_SECONDS,
  getLeaderPickTimeout,
  getCompetitivePickTimeout,
} from './timers'

/**
 * The rule under test: a pick whose scheduled timeout is 0 is an auto-pick, and
 * an auto-pick is held for AUTO_PICK_REVEAL_SECONDS rather than fired at once.
 * `shouldForcePickNow` mirrors the branch in src/utils/draftTimeout.ts.
 */
function shouldForcePickNow(timeoutSeconds: number, elapsedMs: number): boolean {
  const holdSeconds = timeoutSeconds > 0 ? timeoutSeconds : AUTO_PICK_REVEAL_SECONDS
  return elapsedMs >= holdSeconds * 1000
}

test('SPEC: the last leader is shown before it is taken', () => {
  // Round 3 of the leader draft: one leader left, nothing to choose.
  const timeout = getLeaderPickTimeout(1)
  assert.equal(timeout, 0, 'one leader remaining is an auto-pick')

  assert.equal(shouldForcePickNow(timeout, 0), false, 'not the instant it is dealt')
  assert.equal(shouldForcePickNow(timeout, 2_000), false, 'not before the reveal is over')
  assert.equal(shouldForcePickNow(timeout, 2_500), true, 'taken once it has been seen')
})

test('SPEC: the last card of a pack gets the same beat', () => {
  const timeout = getCompetitivePickTimeout(1)
  assert.equal(timeout, 0)
  assert.equal(shouldForcePickNow(timeout, 1_000), false)
  assert.equal(shouldForcePickNow(timeout, 3_000), true)
})

test('SPEC: a real pick clock is untouched by the reveal hold', () => {
  // A 15s leader pick must not be cut short to 2.5s, nor extended.
  const timeout = getLeaderPickTimeout(3)
  assert.equal(timeout, 15)
  assert.equal(shouldForcePickNow(timeout, 2_500), false, 'the reveal hold is not a timeout')
  assert.equal(shouldForcePickNow(timeout, 14_999), false)
  assert.equal(shouldForcePickNow(timeout, 15_000), true)
})

test('the reveal is long enough to read a card and short enough not to ask for one', () => {
  assert.ok(AUTO_PICK_REVEAL_SECONDS >= 1.5, 'too short to see')
  assert.ok(AUTO_PICK_REVEAL_SECONDS <= 4, 'long enough to feel like it wants a decision')
})
