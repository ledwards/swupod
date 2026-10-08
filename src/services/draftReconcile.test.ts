// Tests for draft state reconciliation.
//
// SPEC: the draft page's live updates arrive over a socket broadcast. A
// broadcast that never lands — a transport hiccup, a throttled tab, an emit
// that falls between a disconnect and the rejoin — leaves the client's
// stateVersion behind the server's with nothing to correct it: the next
// broadcast describes the NEXT change, so a player whose pack has already
// been passed to them waits for an event that will never come.
//
// SPEC: a slow backstop poll of GET /api/draft/:shareId/state?sinceVersion=N
// closes that gap. The socket stays the fast path; this only has to notice
// that the server has moved on without us.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  DRAFT_RECONCILE_INTERVAL_MS,
  shouldReconcileDraft,
  hasMissedState,
} from './draftReconcile'

describe('draftReconcile — recovering from a missed broadcast', () => {
  describe('hasMissedState', () => {
    it('BUGGY: relying on broadcasts alone, a client behind the server never catches up', () => {
      // The client is on version 7. The server moved to 8 and the broadcast
      // was lost. Nothing in the socket path will fire again until version 9,
      // so without a poll this client is stuck — which is exactly what
      // hasMissedState exists to detect.
      assert.strictEqual(hasMissedState({ changed: true, stateVersion: 8 }, 7), true)
    })

    it('SPEC: a poll reporting no change is not a missed broadcast', () => {
      assert.strictEqual(hasMissedState({ changed: false, stateVersion: 7 }, 7), false)
    })

    it('SPEC: a poll at the version we already hold changes nothing', () => {
      assert.strictEqual(hasMissedState({ changed: true, stateVersion: 7 }, 7), false)
    })

    it('SPEC: a poll behind us — a reordered or stale response — is ignored', () => {
      assert.strictEqual(hasMissedState({ changed: true, stateVersion: 6 }, 7), false)
    })

    it('SPEC: a response with no version is ignored rather than treated as version 0', () => {
      assert.strictEqual(hasMissedState({ changed: true }, 7), false)
      assert.strictEqual(hasMissedState(null, 7), false)
      assert.strictEqual(hasMissedState(undefined, 0), false)
    })

    it('SPEC: catches up however far behind the client has fallen', () => {
      assert.strictEqual(hasMissedState({ changed: true, stateVersion: 42 }, 7), true)
    })
  })

  describe('shouldReconcileDraft', () => {
    it('SPEC: reconciles a draft that is still being played', () => {
      assert.strictEqual(
        shouldReconcileDraft({ enabled: true, deleted: false, status: 'active' }), true)
      assert.strictEqual(
        shouldReconcileDraft({ enabled: true, deleted: false, status: 'waiting' }), true)
    })

    it('SPEC: stops once the draft can no longer change', () => {
      assert.strictEqual(
        shouldReconcileDraft({ enabled: true, deleted: false, status: 'completed' }), false)
      assert.strictEqual(
        shouldReconcileDraft({ enabled: true, deleted: false, status: 'cancelled' }), false)
    })

    it('SPEC: stops on a deleted draft — there is nothing left to poll for', () => {
      assert.strictEqual(
        shouldReconcileDraft({ enabled: true, deleted: true, status: 'active' }), false)
    })

    it('SPEC: honours the hook being disabled', () => {
      assert.strictEqual(
        shouldReconcileDraft({ enabled: false, deleted: false, status: 'active' }), false)
    })

    it('SPEC: keeps polling before the first load has settled a status', () => {
      // No status yet means the initial fetch has not returned. Backing off
      // here would leave a client that missed its very first broadcast with
      // nothing to recover it.
      assert.strictEqual(
        shouldReconcileDraft({ enabled: true, deleted: false, status: undefined }), true)
    })
  })

  describe('the interval', () => {
    it('SPEC: is a backstop, not a transport — slower than the old 2s poll', () => {
      assert.ok(
        DRAFT_RECONCILE_INTERVAL_MS >= 5_000,
        `SPEC: the socket is the fast path; ${DRAFT_RECONCILE_INTERVAL_MS}ms polls like a transport`,
      )
    })

    it('SPEC: still recovers a stuck player in seconds, not minutes', () => {
      assert.ok(
        DRAFT_RECONCILE_INTERVAL_MS <= 15_000,
        `SPEC: a missed pack must not strand a player for ${DRAFT_RECONCILE_INTERVAL_MS}ms`,
      )
    })
  })
})
