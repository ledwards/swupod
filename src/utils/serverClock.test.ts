import { test } from 'node:test'
import assert from 'node:assert'
import {
  elapsedTimerSeconds,
  estimateServerTimeOffsetMs,
  remainingTimerSeconds,
  serverSyncedNowMs,
  shiftTimerStartForPause,
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

// --- shiftTimerStartForPause (Last Player timer pause handling) ---
//
// BUGGY (old behavior): the Last Player countdown read lastPlayerStartedAt
// directly with no paused-duration term, so pausing for longer than the timer
// made it resume already expired.

test('FIXED: a pause during the timer shifts its start by the paused time', () => {
  // Timer starts, 10s later host pauses, resumes 60s after that.
  const pausedAt = new Date(STARTED_AT_MS + 10_000).toISOString()
  const resumedAtMs = STARTED_AT_MS + 70_000

  const shifted = shiftTimerStartForPause(STARTED_AT, pausedAt, resumedAtMs)

  assert.strictEqual(shifted, new Date(STARTED_AT_MS + 60_000).toISOString())
  // 10 of the 30 seconds were used before the pause; 20 remain on resume.
  assert.strictEqual(
    remainingTimerSeconds({ totalSeconds: 30, startedAt: shifted, nowMs: resumedAtMs }),
    20,
  )
})

test('FIXED: a pause that began before the timer started only counts the overlap', () => {
  // Host paused 60s before this timer started — that stretch never froze it.
  const pausedAt = new Date(STARTED_AT_MS - 60_000).toISOString()
  const resumedAtMs = STARTED_AT_MS + 15_000

  const shifted = shiftTimerStartForPause(STARTED_AT, pausedAt, resumedAtMs)

  // Shift is measured from the timer's own start, not from pausedAt.
  assert.strictEqual(shifted, new Date(STARTED_AT_MS + 15_000).toISOString())
  assert.strictEqual(
    remainingTimerSeconds({ totalSeconds: 30, startedAt: shifted, nowMs: resumedAtMs }),
    30,
  )
})

test('shiftTimerStartForPause returns null when there is nothing to shift', () => {
  assert.strictEqual(shiftTimerStartForPause(null, STARTED_AT), null)
  assert.strictEqual(shiftTimerStartForPause(STARTED_AT, null), null)
  assert.strictEqual(shiftTimerStartForPause(undefined, undefined), null)
  // Resume timestamp earlier than the pause: no elapsed freeze.
  assert.strictEqual(
    shiftTimerStartForPause(STARTED_AT, STARTED_AT, STARTED_AT_MS - 1000),
    null,
  )
})
