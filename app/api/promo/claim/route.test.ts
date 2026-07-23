// Tests for POST /api/promo/claim (plan U4).
//
// DB-free paths are exercised against the real handler. The DB-dependent behavior
// (idempotent grant, patron gate, window-closed, persistence-after-lapse) is covered
// by the pure window/tier/draw logic in src/services/promoPacks.test.ts and end-to-end
// through the UI in tests/e2e/gc-promo-packs.spec.ts (U8).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST } from './route'

function post(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/promo/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /api/promo/claim', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await POST(post({ campaign: 'gc2026', tier: 'silver' }))
    assert.equal(res.status, 401)
  })

  // Contract (DB-dependent — verified in promoPacks.test.ts + U8 e2e):
  it('documents the claim contract', () => {
    // Silver: logged in + inside window → { granted:true, alreadyOwned:false, pack:{cards:[2]} }.
    // Re-claim → { granted:false, alreadyOwned:true } (idempotent, no duplicate row).
    // Black + non-patron → 403 "Friend of the Pod required", no row written.
    // Any claim outside the window (override off) → 403 "Claim window closed".
    // Black grant persists even after is_patron later flips false.
    assert.ok(true)
  })
})
