// Tests for GET /api/voice-packs/entitlements.
//
// SPEC: voice packs are tiered.
//   - Friends of the Pod (users.is_patron, and admins) hold EVERY active creator
//     pack without redeeming anything.
//   - Everyone else holds exactly the packs they redeemed a code for.
//   - Anonymous callers get an empty list, never a 401 — the picker renders a
//     locked state, it does not bounce the visitor to a login.
//   - The built-in packs are never in this payload: the language packs are free and
//     the client already ships them; which built-ins are patron-only is a rule
//     (PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS), not a row in this response.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { canUseVoicePack, PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS } from '@/src/services/voicePacks'

function anonymous(): NextRequest {
  return new NextRequest('http://localhost/api/voice-packs/entitlements')
}

describe('GET /api/voice-packs/entitlements', () => {
  it('SPEC: an anonymous caller gets an empty list, not a 401', async () => {
    const res = await GET(anonymous())
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.data.packs, [])
  })

  it('SPEC: the payload tells the client whether the viewer is a patron', async () => {
    // The dropdown needs this to decide whether to show the Friend-of-the-Pod
    // upsell; an anonymous viewer is never a patron.
    const body = await (await GET(anonymous())).json()
    assert.equal(body.data.isPatron, false)
  })

  it('SPEC: no built-in pack is ever listed here', async () => {
    const body = await (await GET(anonymous())).json()
    const ids = (body.data.packs as { id: string }[]).map((p) => p.id)
    for (const builtIn of PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS) {
      assert.equal(ids.includes(builtIn), false)
    }
  })

  // Contract (DB-dependent), asserted on the shared rule where it is pure:
  it('documents the tiering the query implements', () => {
    const CREATOR = 'ba5eba11-0000-4000-8000-000000000001'
    // A patron holds every active pack…
    assert.equal(
      canUseVoicePack(CREATOR, { isBuiltIn: false, isPatron: true, hasEntitlement: false }),
      true
    )
    // …everyone else holds only what they redeemed.
    assert.equal(
      canUseVoicePack(CREATOR, { isBuiltIn: false, isPatron: false, hasEntitlement: false }),
      false
    )
    // The query mirrors that with `WHERE vp.status = 'active' AND ($2 OR e.user_id
    // IS NOT NULL)`, and reads is_patron from the users table per request — never
    // from the JWT, which does not carry it.
    //
    // unlockedVia: 'code' when an entitlement row exists (permanent, survives a
    // lapsed pledge), otherwise 'friend-of-the-pod'.
    assert.ok(true)
  })
})
