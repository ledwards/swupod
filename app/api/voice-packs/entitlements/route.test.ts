// Tests for GET /api/voice-packs/entitlements.
//
// SPEC: voice packs are tiered.
//   - Friends of the Pod (users.is_patron, and admins) hold EVERY active creator
//     pack without redeeming anything.
//   - Everyone else holds exactly the packs they redeemed a code for.
//   - Anonymous callers get an empty list, never a 401 — the picker renders a
//     locked state, it does not bounce the visitor to a login.
//   - The built-in packs (the languages) are never in this payload: the client
//     already ships them and they need no unlock.
//   - Leebo is NOT a built-in. He is the first creator pack (migration 086), so he
//     appears here exactly like any other — with unlockedVia 'code' when redeemed
//     and 'friend-of-the-pod' when the pledge is what opens it.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { canUseVoicePack } from '@/src/services/voicePacks'
import { BUILT_IN_VOICE_PACKS } from '@/src/utils/voicePackAssets'

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
    for (const pack of BUILT_IN_VOICE_PACKS) {
      assert.equal(ids.includes(pack.id), false, `${pack.id} is free and must not be listed`)
    }
  })

  // Contract (DB-dependent), asserted on the shared rule where it is pure:
  it('documents the tiering the query implements', () => {
    // A patron holds every active pack…
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: true, hasEntitlement: false }),
      true
    )
    // …everyone else holds only what they redeemed.
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: false }),
      false
    )
    // The query mirrors that with `WHERE vp.status = 'active' AND ($2 OR e.user_id
    // IS NOT NULL)`, and reads is_patron from the users table per request — never
    // from the JWT, which does not carry it.
    //
    // unlockedVia: 'code' when an entitlement row exists (permanent, survives a
    // lapsed pledge), otherwise 'friend-of-the-pod'.
    //
    // Leebo is gathered by that same query — there is no second pass for him.
  })
})
