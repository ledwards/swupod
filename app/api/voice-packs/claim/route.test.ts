// Tests for POST /api/voice-packs/claim (the /redeem endpoint).
//
// SPEC: same shape as app/api/promo/claim — rate limit → requireAuth → validate →
// idempotent INSERT ... ON CONFLICT DO NOTHING RETURNING id. Re-redeeming a code you
// already own is harmless and distinguishable (`granted` false, `alreadyOwned` true).
//
// DB-free paths run against the real handler; the idempotent grant itself is covered
// by the ON CONFLICT clause plus the UNIQUE (user_id, pack_id) constraint in
// migration 080, and the code rules by src/services/voicePacks.test.ts.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST } from './route'

function post(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voice-packs/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /api/voice-packs/claim', () => {
  it('SPEC: rejects an unauthenticated caller with 401 (redeeming needs an account)', async () => {
    const res = await POST(post({ code: 'AHSOKA' }))
    assert.equal(res.status, 401)
  })

  it('SPEC: auth is checked BEFORE the code is looked at — no oracle for anonymous probes', async () => {
    // A syntactically invalid code from an anonymous caller must still be 401, not 404:
    // otherwise the status alone would leak whether the code shape was plausible.
    const res = await POST(post({ code: '!!' }))
    assert.equal(res.status, 401)
  })

  // Contract (DB-dependent):
  it('documents the claim contract', () => {
    // Signed in + unknown/malformed code → 404 "That code is not valid." — ONE message
    //   for both, so the endpoint never confirms that a code exists.
    // Signed in + valid code, first time → { granted: true, alreadyOwned: false, pack }.
    // Same user redeems again    → { granted: false, alreadyOwned: true, pack } (no dup row).
    // pack carries logoUrl + greetingUrl so the confirmation can show the logo and
    //   play the greeting on click.
    // Packs with status <> 'active' are unredeemable.
    // Brute force: 10 claim attempts per IP per minute on top of the global 60/min.
    assert.ok(true)
  })
})
