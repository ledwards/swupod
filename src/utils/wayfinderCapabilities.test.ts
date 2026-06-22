import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRACTICE_LIVE_CAPABILITY,
  parseCapabilities,
  wayfinderPracticeTier,
  isPracticeLiveReady,
  shouldShowUpdateNudge,
} from './wayfinderCapabilities'

test('parseCapabilities normalizes arrays, comma-strings, and junk', () => {
  assert.deepEqual(parseCapabilities(['a', 'b']), ['a', 'b'])
  assert.deepEqual(parseCapabilities('a, b ,c'), ['a', 'b', 'c'])
  assert.deepEqual(parseCapabilities(['a', 1, null, 'b']), ['a', 'b'])
  assert.deepEqual(parseCapabilities(''), [])
  assert.deepEqual(parseCapabilities(null), [])
  assert.deepEqual(parseCapabilities(undefined), [])
  assert.deepEqual(parseCapabilities(42), [])
})

test('wayfinderPracticeTier: no Companion → none (manual)', () => {
  assert.equal(wayfinderPracticeTier(false, []), 'none')
  assert.equal(wayfinderPracticeTier(false, [PRACTICE_LIVE_CAPABILITY]), 'none')
})

test('wayfinderPracticeTier: old Companion (detected, no capability) → needs-update', () => {
  assert.equal(wayfinderPracticeTier(true, []), 'needs-update')
  assert.equal(wayfinderPracticeTier(true, ['some-other-cap']), 'needs-update')
  assert.equal(wayfinderPracticeTier(true, null), 'needs-update')
})

test('wayfinderPracticeTier: capable Companion → ready', () => {
  assert.equal(wayfinderPracticeTier(true, [PRACTICE_LIVE_CAPABILITY]), 'ready')
  assert.equal(wayfinderPracticeTier(true, ['x', PRACTICE_LIVE_CAPABILITY]), 'ready')
})

test('isPracticeLiveReady only for the ready tier', () => {
  assert.equal(isPracticeLiveReady('ready'), true)
  assert.equal(isPracticeLiveReady('needs-update'), false)
  assert.equal(isPracticeLiveReady('none'), false)
})

test('shouldShowUpdateNudge only for a detected-but-incapable Companion, once settled', () => {
  assert.equal(shouldShowUpdateNudge('needs-update', true), true)
  assert.equal(shouldShowUpdateNudge('needs-update', false), false) // don't flash before settled
  assert.equal(shouldShowUpdateNudge('none', true), false)
  assert.equal(shouldShowUpdateNudge('ready', true), false)
})
