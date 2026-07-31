/**
 * SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Phase 2):
 *
 *   "count-30/15/5 — competitive mode only, duration-aware (skip when
 *    threshold > totalSeconds - 2; Appendix C picks are short). Fire once per
 *    pick_started_at."
 *
 * The Appendix C schedule (src/services/matchmaking/timers.ts) hands out picks
 * of 60/40/30/25/20/15/10/5 seconds, so the duration rule is load-bearing:
 * without it a 30-second pick would open by announcing "thirty seconds".
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  COUNTDOWN_THRESHOLDS,
  MIN_LEAD_SECONDS,
  audibleThresholds,
  countdownCueClip,
  crossedCountdownCues,
  crossedCountdownThresholds,
  isThresholdAudible,
} from './countdownCues'

describe('countdown cue thresholds', () => {
  it('SPEC: the spoken marks are 30, 15 and 5 seconds', () => {
    assert.deepStrictEqual([...COUNTDOWN_THRESHOLDS], [30, 15, 5])
  })

  it('SPEC: each mark maps to its clip id', () => {
    assert.strictEqual(countdownCueClip(30), 'count-30')
    assert.strictEqual(countdownCueClip(15), 'count-15')
    assert.strictEqual(countdownCueClip(5), 'count-5')
  })
})

describe('isThresholdAudible (duration-aware suppression)', () => {
  it('SPEC: a mark speaks only when it lands at least 2s after the start', () => {
    assert.strictEqual(MIN_LEAD_SECONDS, 2)
    // 30s mark on a 32s period lands exactly 2s in — the boundary, allowed.
    assert.strictEqual(isThresholdAudible(30, 32), true)
    assert.strictEqual(isThresholdAudible(30, 31), false)
    assert.strictEqual(isThresholdAudible(30, 30), false)
  })

  it('SPEC: Appendix C pick lengths get exactly these marks', () => {
    // 60s and 40s picks are long enough for the full ladder.
    assert.deepStrictEqual(audibleThresholds(60), [30, 15, 5])
    assert.deepStrictEqual(audibleThresholds(40), [30, 15, 5])
    // A 30s pick must NOT open with "thirty seconds".
    assert.deepStrictEqual(audibleThresholds(30), [15, 5])
    assert.deepStrictEqual(audibleThresholds(25), [15, 5])
    assert.deepStrictEqual(audibleThresholds(20), [15, 5])
    // A 15s pick must NOT open with "fifteen seconds".
    assert.deepStrictEqual(audibleThresholds(15), [5])
    assert.deepStrictEqual(audibleThresholds(10), [5])
    // A 5s pick has nothing to announce but the end.
    assert.deepStrictEqual(audibleThresholds(5), [])
  })

  it('a nonsense period announces nothing', () => {
    assert.deepStrictEqual(audibleThresholds(0), [])
    assert.deepStrictEqual(audibleThresholds(-10), [])
    assert.deepStrictEqual(audibleThresholds(Number.NaN), [])
  })
})

describe('crossedCountdownThresholds', () => {
  it('SPEC: a mark fires on the tick that reaches it', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 31, currentSeconds: 30, totalSeconds: 60 }),
      [30]
    )
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 16, currentSeconds: 15, totalSeconds: 60 }),
      [15]
    )
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 6, currentSeconds: 5, totalSeconds: 60 }),
      [5]
    )
  })

  it('SPEC: ticks that do not reach a mark fire nothing', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 33, currentSeconds: 32, totalSeconds: 60 }),
      []
    )
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 30, currentSeconds: 29, totalSeconds: 60 }),
      []
    )
  })

  it('SPEC: the duration rule suppresses a mark even when the tick crosses it', () => {
    // A 30s pick ticks 30 → 29. Without the duration rule this fires count-30.
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 31, currentSeconds: 30, totalSeconds: 30 }),
      []
    )
    // Same pick, later: 15 is still audible on a 30s period.
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 16, currentSeconds: 15, totalSeconds: 30 }),
      [15]
    )
    // A 15s pick never says "fifteen".
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 16, currentSeconds: 15, totalSeconds: 15 }),
      []
    )
    // A 5s pick says nothing at all.
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 6, currentSeconds: 5, totalSeconds: 5 }),
      []
    )
  })

  it('SPEC: a mark fires at most once per timer period', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({
        previousSeconds: 31,
        currentSeconds: 30,
        totalSeconds: 60,
        firedThresholds: [30],
      }),
      []
    )
  })

  it('a skipped tick (throttled tab) still announces the marks it jumped, most urgent last', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 40, currentSeconds: 4, totalSeconds: 60 }),
      [30, 15, 5]
    )
    // ...and honours what already fired during the jump.
    assert.deepStrictEqual(
      crossedCountdownThresholds({
        previousSeconds: 40,
        currentSeconds: 4,
        totalSeconds: 60,
        firedThresholds: [30, 15],
      }),
      [5]
    )
  })

  it('the first observation of a period crosses nothing', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: null, currentSeconds: 30, totalSeconds: 60 }),
      []
    )
  })

  it('a client that joins mid-pick does not blurt out the marks it missed', () => {
    // Joins with 12s left on a 60s pick: 30 and 15 are gone, 5 still speaks.
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: null, currentSeconds: 12, totalSeconds: 60 }),
      []
    )
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 6, currentSeconds: 5, totalSeconds: 60 }),
      [5]
    )
  })

  it('SPEC: zero is time-is-up, not a countdown mark', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 1, currentSeconds: 0, totalSeconds: 60 }),
      []
    )
  })

  it('a restarted timer (remaining went up) is a new period, not a crossing', () => {
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 3, currentSeconds: 60, totalSeconds: 60 }),
      []
    )
    assert.deepStrictEqual(
      crossedCountdownThresholds({ previousSeconds: 30, currentSeconds: 30, totalSeconds: 60 }),
      []
    )
  })
})

describe('crossedCountdownCues', () => {
  it('SPEC: crossings map to clip ids', () => {
    assert.deepStrictEqual(
      crossedCountdownCues({ previousSeconds: 40, currentSeconds: 4, totalSeconds: 60 }),
      ['count-30', 'count-15', 'count-5']
    )
    assert.deepStrictEqual(
      crossedCountdownCues({ previousSeconds: 16, currentSeconds: 15, totalSeconds: 30 }),
      ['count-15']
    )
  })
})
