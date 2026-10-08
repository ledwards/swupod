/**
 * Tests for the lobby Ready toggle (POST /api/draft/:shareId/ready).
 *
 * Strategy follows the project convention (see
 * app/api/draft/[shareId]/leave/route.test.ts): the load-bearing, DB-free logic
 * is exported from route.ts and exercised directly.
 *
 * SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Phase 2):
 *   "Each human player in the draft lobby gets a Ready toggle (bots always
 *    ready). Host's deal button is enabled only when all human players are
 *    ready."
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { allHumansReady, resolveReadyValue, validateReadyToggle } from './route'

describe('validateReadyToggle', () => {
  it('SPEC: a seated human may toggle ready in the lobby', () => {
    assert.deepStrictEqual(
      validateReadyToggle({ status: 'waiting' }, { id: 'p1', is_bot: false, lobby_ready: false }),
      { ok: true }
    )
  })

  it('SPEC: someone with no seat cannot ready (spectators, randoms with the link)', () => {
    const result = validateReadyToggle({ status: 'waiting' }, null)
    assert.strictEqual(result.ok, false)
    assert.strictEqual((result as { status: number }).status, 403)
  })

  it('SPEC: ready is a lobby-only action — packs are dealt, the flag is history', () => {
    const active = validateReadyToggle({ status: 'active' }, { id: 'p1', is_bot: false })
    assert.strictEqual(active.ok, false)
    assert.strictEqual((active as { status: number }).status, 400)

    const complete = validateReadyToggle({ status: 'complete' }, { id: 'p1', is_bot: false })
    assert.strictEqual(complete.ok, false)
  })

  it('SPEC: a bot never stores readiness — it is ready by definition', () => {
    const result = validateReadyToggle({ status: 'waiting' }, { id: 'bot1', is_bot: true })
    assert.strictEqual(result.ok, false)
  })
})

describe('resolveReadyValue', () => {
  it('SPEC: readying is one-way — nothing a caller sends takes it back', () => {
    // This used to honour `ready` from the request body, so a crafted POST (or a
    // stale client) could un-ready a seat and stall the host's deal button.
    assert.strictEqual(resolveReadyValue(), true)
  })

  it('SPEC: pressing again is a harmless no-op, not a withdrawal', () => {
    // Idempotent by construction: the value does not depend on current state, so
    // a double-click or a retried request lands on the same row value.
    assert.strictEqual(resolveReadyValue(), true)
    assert.strictEqual(resolveReadyValue(), true)
  })

  it('takes no arguments, so there is no un-ready path to reintroduce by accident', () => {
    assert.strictEqual(resolveReadyValue.length, 0)
  })
})

describe('allHumansReady (the host deal-button gate)', () => {
  it('SPEC: the button unlocks only when every human seat is ready', () => {
    assert.strictEqual(
      allHumansReady([
        { is_bot: false, lobby_ready: true },
        { is_bot: false, lobby_ready: true },
      ]),
      true
    )
    assert.strictEqual(
      allHumansReady([
        { is_bot: false, lobby_ready: true },
        { is_bot: false, lobby_ready: false },
      ]),
      false
    )
  })

  it('SPEC: bots are always ready and never hold the pod up', () => {
    assert.strictEqual(
      allHumansReady([
        { is_bot: false, lobby_ready: true },
        { is_bot: true },
        { is_bot: true, lobby_ready: false },
      ]),
      true
    )
  })

  it('an all-bot table is ready', () => {
    assert.strictEqual(allHumansReady([{ is_bot: true }, { is_bot: true }]), true)
  })

  it('an empty table does not block (nothing to wait for)', () => {
    assert.strictEqual(allHumansReady([]), true)
  })
})
