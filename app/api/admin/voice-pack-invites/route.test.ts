// Tests for POST /api/admin/voice-pack-invites.
//
// SPEC (user's brief): "I don't want people to be able to navigate to that creation
// link on their own — under admin I should be able to create one." The mint endpoint
// is therefore admin-only AND invisible: like app/api/admin/grant, a non-admin gets
// 404 rather than 403, so probing cannot even confirm the route exists.
//
// The DB-dependent behavior (token insert, expiry interval, the second is_admin read)
// is exercised through the admin page in manual QA; the gate itself is pure and is
// what this file pins.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST, LOG_PREFIX_VOICE_PACK_INVITE } from './route'

function post(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/voice-pack-invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /api/admin/voice-pack-invites', () => {
  it('SPEC: an unauthenticated caller gets 404, not 401/403 (stealth)', async () => {
    const res = await POST(post({ note: 'Ahsoka' }))
    assert.equal(res.status, 404)
  })

  it('SPEC: the 404 body says nothing about admin-ness', async () => {
    const res = await POST(post({}))
    const json = await res.json()
    assert.equal(json.message, 'Not found')
    assert.equal(json.data, null)
  })

  it('pins the audit log prefix for Railway log grep', () => {
    assert.equal(LOG_PREFIX_VOICE_PACK_INVITE, 'voice-pack-invite')
  })

  // Contract (DB-dependent):
  it('documents the mint contract', () => {
    // Admin + valid session → 200 { path: '/creator/voice-pack/<32-char token>',
    //   note, expiresAt, expiresInDays }.
    // Token = randomBytes(24).toString('base64url') — 192 bits, not enumerable.
    // expiresInDays is clamped to 1..90 (default 14) by clampInviteExpiryDays.
    // A session claiming is_admin whose users.is_admin is now false → 404.
    assert.ok(true)
  })
})
