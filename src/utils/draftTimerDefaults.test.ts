import { test } from 'node:test'
import assert from 'node:assert'
import { defaultRoundTimerEnabled, isRoundTimerEnabled } from './draftTimerDefaults'

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
