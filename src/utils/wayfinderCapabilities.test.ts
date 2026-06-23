import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  wayfinderPracticeTier,
  isPracticeLiveReady,
} from './wayfinderCapabilities'

test('wayfinderPracticeTier: no Companion → none (manual)', () => {
  assert.equal(wayfinderPracticeTier(false), 'none')
})

test('wayfinderPracticeTier: any detected Companion → ready (no version/capability gate)', () => {
  // SPEC: detection alone enables the live launch. We never tell a user with the
  // Companion to "update" — there is no capability/version check.
  assert.equal(wayfinderPracticeTier(true), 'ready')
})

test('isPracticeLiveReady only for the ready tier', () => {
  assert.equal(isPracticeLiveReady('ready'), true)
  assert.equal(isPracticeLiveReady('none'), false)
})
