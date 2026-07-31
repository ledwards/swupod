/**
 * Tests for POST /api/draft/:shareId/begin-picking (leader preview feature).
 *
 * Strategy follows the project convention (see
 * app/api/draft/[shareId]/report/slideshow/route.test.ts): the load-bearing,
 * DB-free logic of the route is exported as pure functions from route.ts and
 * exercised directly against the SPEC — no database, no mocking.
 *
 * SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Feature 2):
 *   - Lobby "Ready" deals packs into phase 'leader_preview' — nobody can pick.
 *   - The host-only begin-picking transition requires status='active' AND
 *     draft_state.phase='leader_preview'; non-hosts get 403.
 *   - The transition flips phase to 'leader_draft' while preserving every
 *     other draft_state key (leaderRound, totalPacks, ...).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validateBeginPicking, buildBeginPickingDraftState } from './route'

const HOST_ID = 'user-host'
const OTHER_ID = 'user-other'

function makePod(overrides: Record<string, unknown> = {}) {
  return {
    host_id: HOST_ID,
    status: 'active',
    draft_state: { phase: 'leader_preview', leaderRound: 1, totalPacks: 3 },
    ...overrides,
  }
}

describe('validateBeginPicking', () => {
  it('SPEC: host may begin picking on an active draft in leader_preview', () => {
    const result = validateBeginPicking(makePod(), HOST_ID)
    assert.strictEqual(result.ok, true)
    if (result.ok) {
      assert.strictEqual(result.draftState.phase, 'leader_preview')
    }
  })

  it('SPEC: non-host is rejected with 403', () => {
    const result = validateBeginPicking(makePod(), OTHER_ID)
    assert.strictEqual(result.ok, false)
    if (!result.ok) assert.strictEqual(result.status, 403)
  })

  it('SPEC: draft still in the lobby (status=waiting) is rejected with 400', () => {
    const result = validateBeginPicking(makePod({ status: 'waiting' }), HOST_ID)
    assert.strictEqual(result.ok, false)
    if (!result.ok) assert.strictEqual(result.status, 400)
  })

  it('SPEC: completed draft is rejected with 400', () => {
    const result = validateBeginPicking(makePod({ status: 'completed' }), HOST_ID)
    assert.strictEqual(result.ok, false)
    if (!result.ok) assert.strictEqual(result.status, 400)
  })

  it('SPEC: already-started draft (phase=leader_draft) is rejected with 409 — double-click safe', () => {
    const result = validateBeginPicking(
      makePod({ draft_state: { phase: 'leader_draft', leaderRound: 1 } }),
      HOST_ID
    )
    assert.strictEqual(result.ok, false)
    if (!result.ok) assert.strictEqual(result.status, 409)
  })

  it('SPEC: pack_draft phase is rejected with 409', () => {
    const result = validateBeginPicking(
      makePod({ draft_state: { phase: 'pack_draft', packNumber: 2 } }),
      HOST_ID
    )
    assert.strictEqual(result.ok, false)
    if (!result.ok) assert.strictEqual(result.status, 409)
  })

  it('parses draft_state stored as a JSON string (pg TEXT round-trip)', () => {
    const result = validateBeginPicking(
      makePod({ draft_state: JSON.stringify({ phase: 'leader_preview', leaderRound: 1 }) }),
      HOST_ID
    )
    assert.strictEqual(result.ok, true)
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
    // Input is not mutated
    assert.strictEqual(prev.phase, 'leader_preview')
  })
})
