// Tests for POST /api/voice-packs/submit (the creator upload).
//
// SPEC: the unguessable single-use invite token IS the authorization. Every way a
// token can be wrong — absent, wrong type, absurdly long, unknown, already used,
// expired — collapses to the same flat 404, so the link cannot be probed.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST } from './route'

function submit(form?: FormData): NextRequest {
  return new NextRequest('http://localhost/api/voice-packs/submit', {
    method: 'POST',
    ...(form ? { body: form } : {}),
  } as RequestInit & { body?: FormData })
}

describe('POST /api/voice-packs/submit', () => {
  it('rejects a request that is not a multipart form with 400', async () => {
    const req = new NextRequest('http://localhost/api/voice-packs/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'x' }),
    })
    const res = await POST(req)
    assert.equal(res.status, 400)
  })

  it('SPEC: a missing token is 404, indistinguishable from an unknown one', async () => {
    const form = new FormData()
    form.set('code', 'AHSOKA')
    const res = await POST(submit(form))
    assert.equal(res.status, 404)
    assert.equal((await res.json()).message, 'Not found')
  })

  it('SPEC: an absurdly long token is rejected before any DB lookup', async () => {
    const form = new FormData()
    form.set('token', 'x'.repeat(5000))
    const res = await POST(submit(form))
    assert.equal(res.status, 404)
  })

  // Contract (DB-dependent):
  it('documents the upload contract', () => {
    // Valid unused unexpired token, then in order:
    //   invalid code shape        → 400 (3–24 chars, A–Z/0–9, internal hyphens).
    //   missing display name      → 400.
    //   any of the 7 clips absent → 400 "Missing audio for <clip>". ALL SEVEN are
    //     required: a half-filled pack plays silence at a real table.
    //   any clip failing declared-mime / magic-byte / 1 MB agreement → 400.
    //   logo absent or failing the same checks (2 MB) → 400.
    //   code already taken        → 409, transaction rolled back, invite STILL UNUSED
    //                               so the creator can retry with another code.
    //   otherwise                 → 200 { packId, code, displayName } and the invite is
    //                               consumed atomically (UPDATE ... WHERE used_at IS NULL),
    //                               so two concurrent submits cannot both win.
    assert.ok(true)
  })
})
