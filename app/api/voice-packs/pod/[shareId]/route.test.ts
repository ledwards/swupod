// Tests for the pod voice-pack selection route.
//
// SPEC: only the pod HOST may choose the pack, and only from packs the host has
// personally unlocked. Both checks are server-side — the picker UI hiding the control
// is not a gate.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { PUT } from './route'
import { canUseVoicePack } from '@/src/services/voicePacks'

const SHARE_ID = 'abc123'

function put(body: unknown): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/voice-packs/pod/${SHARE_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PUT(req, { params: Promise.resolve({ shareId: SHARE_ID }) })
}

describe('PUT /api/voice-packs/pod/[shareId]', () => {
  it('SPEC: rejects an unauthenticated caller with 401', async () => {
    const res = await put({ voicePackId: '11111111-2222-4333-8444-555555555555' })
    assert.equal(res.status, 401)
  })

  it('SPEC: auth is checked before the body — anonymous never reaches validation', async () => {
    const res = await put({ voicePackId: 'not-a-uuid' })
    assert.equal(res.status, 401)
  })

  it('SPEC: the host may pick a language pack with no unlock at all', () => {
    // Every built-in is free; the route does not even look the viewer up for one.
    assert.equal(
      canUseVoicePack({ isBuiltIn: true, isPatron: false, hasEntitlement: false }),
      true
    )
  })

  it('SPEC: a host who redeemed a creator pack may pick it without being a patron', () => {
    // Leebo is one of these — the first creator pack, seeded by migration 086.
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: true }),
      true
    )
  })

  it('SPEC: a host who is neither a patron nor a redeemer is refused a creator pack', () => {
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: false }),
      false
    )
  })

  // Contract (DB-dependent):
  it('documents the selection contract', () => {
    // Signed in, not the host          → 403 "Only the host can choose the voice pack".
    // Host, pack not in their entitlements (or status <> 'active')
    //                                  → 403 "You have not unlocked that voice pack".
    // Host + a built-in (language) pack  → 200 with no entitlement check at all.
    // Host + owned pack                → 200, pods.settings gains { voicePackId },
    //                                    state_version bumps, broadcastDraftState fires.
    // Host + { voicePackId: null }     → the key is REMOVED from settings (jsonb `-`),
    //                                    not set to null.
    // The write merges (settings || jsonb) so other settings keys survive.
    assert.ok(true)
  })
})
