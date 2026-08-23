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
import { isValidVoicePackCode, normalizeVoicePackCode } from '@/src/services/voicePacks'

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

  it('SPEC: LEEBO is just another code — anonymous is still 401', async () => {
    // Leebo is the first creator pack, not a special case in this endpoint.
    const res = await POST(post({ code: 'leebo' }))
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

// Leebo is a voice_packs row like anyone else's pack (migration 086), so he has no
// branch of his own here — only the ordinary code path.
describe('POST /api/voice-packs/claim — the Leebo pack', () => {
  it('SPEC: "leebo" typed any way at all is the one code LEEBO', () => {
    // The /redeem box normalizes before sending and the route normalizes again;
    // both use the same function, so every spelling collapses to the stored code.
    for (const typed of ['leebo', 'LEEBO', ' Leebo ', '\tleeBO\n']) {
      assert.equal(normalizeVoicePackCode(typed), 'LEEBO')
      assert.equal(isValidVoicePackCode(normalizeVoicePackCode(typed)), true)
    }
  })

  // Contract (DB-dependent):
  it('documents the Leebo claim contract', () => {
    // Signed in + 'leebo', first time  → { granted: true, alreadyOwned: false, pack },
    //   one voice_pack_entitlements row (user_id, pack_id) pointing at the seeded
    //   pack — the same shape any creator pack produces.
    // Same user again                  → { granted: false, alreadyOwned: true, pack },
    //   no duplicate row: UNIQUE (user_id, pack_id) plus ON CONFLICT DO NOTHING.
    // pack.logoUrl / greetingUrl are the API routes, because the bytes are in the
    //   database — the seed put them there (migrations/assets/leebo/).
    // A Friend of the Pod may redeem it too: the row is permanent and outlives a
    //   lapsed pledge, which is exactly why it is worth taking.
    assert.ok(true)
  })
})
