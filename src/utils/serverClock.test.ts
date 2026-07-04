import { test } from 'node:test'
import assert from 'node:assert'
import {
  elapsedTimerSeconds,
  estimateServerTimeOffsetMs,
  remainingTimerSeconds,
  serverSyncedNowMs,
} from './serverClock'

const STARTED_AT = '2026-06-29T12:00:00.000Z'
const STARTED_AT_MS = new Date(STARTED_AT).getTime()

test('estimateServerTimeOffsetMs returns the server-client clock delta', () => {
  assert.strictEqual(
    estimateServerTimeOffsetMs('2026-06-29T12:00:05.000Z', STARTED_AT_MS),
    5000,
  )
})

test('serverSyncedNowMs applies a known server clock offset', () => {
  assert.strictEqual(serverSyncedNowMs(5000, STARTED_AT_MS), STARTED_AT_MS + 5000)
})

test('remainingTimerSeconds uses the server-synced clock, not only the local browser clock', () => {
  const totalSeconds = 60
  const localNowFiveSecondsBehindServer = STARTED_AT_MS + 55_000

  assert.strictEqual(
    remainingTimerSeconds({
      totalSeconds,
      startedAt: STARTED_AT,
      nowMs: localNowFiveSecondsBehindServer,
    }),
    5,
  )

  assert.strictEqual(
    remainingTimerSeconds({
      totalSeconds,
      startedAt: STARTED_AT,
      serverTimeOffsetMs: 5000,
      nowMs: localNowFiveSecondsBehindServer,
    }),
    0,
  )
})

test('elapsedTimerSeconds preserves stale pause-duration protection', () => {
  assert.strictEqual(
    elapsedTimerSeconds({
      startedAt: STARTED_AT,
      pausedDurationSeconds: 60,
      nowMs: STARTED_AT_MS + 10_000,
    }),
    10,
  )
})
