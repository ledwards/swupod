import { test } from 'node:test'
import assert from 'node:assert'
import { defaultRoundTimerEnabled, isRoundTimerEnabled, getDisplayPickSeconds } from './draftTimerDefaults'

// Regression: timers were invisible in Competitive Practice drafts. Competitive
// hides the in-draft host timer controls, so a competitive draft created with
// the round timer OFF could never turn it on — the timer never appeared.

test('defaultRoundTimerEnabled: competitive drafts create with the round timer ON', () => {
  assert.strictEqual(defaultRoundTimerEnabled(true), true)
})

test('defaultRoundTimerEnabled: casual drafts default the round timer OFF (host enables it)', () => {
  assert.strictEqual(defaultRoundTimerEnabled(false), false)
})

test('isRoundTimerEnabled: a competitive draft (timed=true) shows the round timer', () => {
  assert.strictEqual(isRoundTimerEnabled({ timed: true }), true)
})

test('isRoundTimerEnabled: an explicit timed=false hides it', () => {
  assert.strictEqual(isRoundTimerEnabled({ timed: false }), false)
})

test('isRoundTimerEnabled: null/undefined timed means ON (matches DB DEFAULT true)', () => {
  assert.strictEqual(isRoundTimerEnabled({}), true)
  assert.strictEqual(isRoundTimerEnabled({ timed: null }), true)
  assert.strictEqual(isRoundTimerEnabled(null), true)
})

// End-to-end of the regression in one assertion: a freshly-created competitive
// draft must end up with a visible round timer.
test('competitive draft: created default flows through to a visible timer', () => {
  const timed = defaultRoundTimerEnabled(true)
  assert.strictEqual(isRoundTimerEnabled({ timed }), true)
})

// Bug (SeaWolf report): in competitive mode the dial showed the fixed,
// host-set round timer instead of the official Appendix C per-card schedule the
// server actually enforces. The fixed value never steps down, so deep into a
// pack the displayed clock disagreed with the real (shrinking) pick budget — the
// "pick timer doesn't show as you get deeper into the draft" symptom.
// getDisplayPickSeconds routes the official schedule onto the round timer.

test('FIXED: competitive pack draft uses the Appendix C per-card schedule (SPEC: 14→60, 10→30, 6→15, 3→5)', () => {
  const base = { competitive: true, phase: 'pack_draft', roundTimeoutSeconds: 120 }
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 14 }), 60)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 10 }), 30)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 6 }), 15)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 3 }), 5)
})

test('FIXED: competitive last card has no timer (SPEC: 1 card remaining is auto-picked → null)', () => {
  assert.strictEqual(
    getDisplayPickSeconds({ competitive: true, phase: 'pack_draft', itemsRemaining: 1, roundTimeoutSeconds: 120 }),
    null
  )
})

test('FIXED: competitive leader draft uses the leader schedule (SPEC: 3→15, 2→10, 1→auto/null)', () => {
  const base = { competitive: true, phase: 'leader_draft', roundTimeoutSeconds: 120 }
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 3 }), 15)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 2 }), 10)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 1 }), null)
})

test('casual draft keeps the fixed host-configured round timeout regardless of cards remaining', () => {
  const base = { competitive: false, phase: 'pack_draft', roundTimeoutSeconds: 90 }
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 14 }), 90)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 3 }), 90)
  assert.strictEqual(getDisplayPickSeconds({ ...base, itemsRemaining: 1 }), 90)
})
