/**
 * Unit tests for the DB-free parts of the leader preview phase.
 *
 * SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Feature 2 + review):
 *   - A draft NEVER starts picking without the host. The only automatic exit
 *     from the preview is cancellation after 24 hours.
 *   - The host's transition flips phase to 'leader_draft', preserving every
 *     other draft_state key, and drops the now-meaningless preview timestamp.
 *
 * The transition itself and the cancel sweep are exercised against a real
 * database in app/api/draft/leader-preview.test.ts.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  LEADER_PREVIEW_CANCEL_AFTER_SECONDS,
  buildBeginPickingDraftState,
} from './draftPreview'

describe('LEADER_PREVIEW_CANCEL_AFTER_SECONDS', () => {
  it('SPEC: a stalled preview is cancelled after 24 hours', () => {
    assert.strictEqual(LEADER_PREVIEW_CANCEL_AFTER_SECONDS, 24 * 60 * 60)
    assert.strictEqual(LEADER_PREVIEW_CANCEL_AFTER_SECONDS, 86400)
  })
})

describe('buildBeginPickingDraftState', () => {
  it('SPEC: flips phase to leader_draft', () => {
    const next = buildBeginPickingDraftState({ phase: 'leader_preview', leaderRound: 1 })
    assert.strictEqual(next.phase, 'leader_draft')
  })

  it('SPEC: preserves every other draft_state key (leaderRound, totalPacks, ...)', () => {
    const prev = {
      phase: 'leader_preview',
      leaderRound: 1,
      totalPacks: 4,
      packNumber: 0,
      pickInPack: 0,
      timerStartedAt: null,
    }
    const next = buildBeginPickingDraftState(prev)
    assert.deepStrictEqual(next, { ...prev, phase: 'leader_draft' })
    assert.strictEqual(prev.phase, 'leader_preview', 'the input is not mutated')
  })

  it('SPEC: drops previewStartedAt — it only means anything during the preview', () => {
    const prev = {
      phase: 'leader_preview',
      leaderRound: 1,
      previewStartedAt: '2026-01-01T00:00:00.000Z',
    }
    const next = buildBeginPickingDraftState(prev)
    assert.strictEqual(next.previewStartedAt, undefined)
    assert.strictEqual(
      prev.previewStartedAt, '2026-01-01T00:00:00.000Z',
      'the input is not mutated'
    )
  })
})
