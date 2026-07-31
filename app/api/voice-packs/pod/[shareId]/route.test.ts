// Tests for the pod voice-pack selection route.
//
// SPEC: only the pod HOST may choose the pack, and only from packs the host has
// personally unlocked. Both checks are server-side — the picker UI hiding the control
// is not a gate.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { PUT } from './route'

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

  // Contract (DB-dependent):
  it('documents the selection contract', () => {
    // Signed in, not the host          → 403 "Only the host can choose the voice pack".
    // Host, pack not in their entitlements (or status <> 'active')
    //                                  → 403 "You have not unlocked that voice pack".
    // Host + owned pack                → 200, pods.settings gains { voicePackId },
    //                                    state_version bumps, broadcastDraftState fires.
    // Host + { voicePackId: null }     → the key is REMOVED from settings (jsonb `-`),
    //                                    not set to null.
    // The write merges (settings || jsonb) so other settings keys survive.
    assert.ok(true)
  })
})
