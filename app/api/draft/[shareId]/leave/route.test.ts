/**
 * Tests for the leave gate (POST /api/draft/:shareId/leave).
 *
 * Strategy follows the project convention (see
 * app/api/draft/[shareId]/begin-picking/route.test.ts): the load-bearing,
 * DB-free logic is exported from route.ts and exercised directly.
 *
 * SPEC: leaving is a lobby action, plus the leader preview — packs are dealt
 * there but nobody has picked, so a seat can still be vacated cleanly. It also
 * has to be allowed: the preview is the one phase a player cannot pick their
 * way out of, so gating leave on status='waiting' let an absent host hold the
 * whole pod hostage.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { canLeaveDraft } from './route'

describe('canLeaveDraft', () => {
  it('SPEC: a player may leave the lobby', () => {
    assert.strictEqual(canLeaveDraft({ status: 'waiting', draft_state: {} }), true)
  })

  // BUGGY (old code): the gate was `status !== 'waiting'` → 400, so during the
  // leader preview nobody could pick (pick_status='waiting') AND nobody could
  // leave. If the host vanished after hitting Ready, every other seat was stuck.
  it('FIXED: a player may leave during the leader preview', () => {
    assert.strictEqual(
      canLeaveDraft({ status: 'active', draft_state: { phase: 'leader_preview' } }),
      true
    )
  })

  it('SPEC: a player may not leave once picking has started', () => {
    assert.strictEqual(
      canLeaveDraft({ status: 'active', draft_state: { phase: 'leader_draft' } }),
      false
    )
    assert.strictEqual(
      canLeaveDraft({ status: 'active', draft_state: { phase: 'pack_draft' } }),
      false
    )
  })

  it('SPEC: a completed draft cannot be left', () => {
    assert.strictEqual(
      canLeaveDraft({ status: 'completed', draft_state: { phase: 'complete' } }),
      false
    )
  })

  it('parses draft_state stored as a JSON string (pg TEXT round-trip)', () => {
    assert.strictEqual(
      canLeaveDraft({ status: 'active', draft_state: JSON.stringify({ phase: 'leader_preview' }) }),
      true
    )
  })

  it('a missing draft_state on an active pod is not leavable', () => {
    assert.strictEqual(canLeaveDraft({ status: 'active' }), false)
    assert.strictEqual(canLeaveDraft({ status: 'active', draft_state: null }), false)
  })
})
