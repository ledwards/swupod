// Guards the prod-safety invariant for the live Swiss test-only HTTP bridge.
// SPEC: the seed/state/cleanup endpoints must be available in dev/test but
// disabled in production unless ALLOW_TEST_USERS is explicitly set — mirroring
// app/api/test/create-user/route.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveSwissTestEndpointsEnabled } from './liveSwiss.ts'

const original = {
  NODE_ENV: process.env.NODE_ENV,
  ALLOW_TEST_USERS: process.env.ALLOW_TEST_USERS,
}

function setEnv(nodeEnv: string | undefined, allowTestUsers: string | undefined): void {
  if (nodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = nodeEnv
  if (allowTestUsers === undefined) delete process.env.ALLOW_TEST_USERS
  else process.env.ALLOW_TEST_USERS = allowTestUsers
}

function restore(): void {
  setEnv(original.NODE_ENV, original.ALLOW_TEST_USERS)
}

test('SPEC: enabled in development', () => {
  setEnv('development', undefined)
  assert.equal(liveSwissTestEndpointsEnabled(), true)
  restore()
})

test('SPEC: enabled in test env', () => {
  setEnv('test', undefined)
  assert.equal(liveSwissTestEndpointsEnabled(), true)
  restore()
})

test('SPEC: DISABLED in production by default', () => {
  setEnv('production', undefined)
  assert.equal(liveSwissTestEndpointsEnabled(), false)
  restore()
})

test('SPEC: production opt-in via ALLOW_TEST_USERS', () => {
  setEnv('production', '1')
  assert.equal(liveSwissTestEndpointsEnabled(), true)
  restore()
})
