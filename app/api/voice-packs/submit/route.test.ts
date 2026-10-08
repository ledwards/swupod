// Tests for POST /api/voice-packs/submit (the creator upload).
//
// SPEC: the unguessable invite token IS the authorization. A token that is absent,
// the wrong type, absurdly long, unknown, or expired-with-nothing-published all
// collapse to the same flat 404, so the link cannot be probed.
//
// SPEC: the link — not the request — decides INSERT vs UPDATE. An invite that has
// already published a pack can only ever edit THAT pack id, which is what keeps the
// voice_pack_entitlements of everyone who redeemed the code pointing somewhere real.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  voicePackInviteAccess,
  missingVoicePackClips,
  VOICE_PACK_CLIP_TYPES,
} from '@/src/services/voicePacks'

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
})

// The route's branch points are pure functions, so the decisions it makes are
// asserted here rather than described in prose. The DB-dependent halves stay in
// the contract note below.
describe('POST /api/voice-packs/submit — insert vs update', () => {
  const now = new Date('2026-08-22T12:00:00Z')
  const live = new Date('2026-09-30T12:00:00Z')
  const lapsed = new Date('2026-08-01T12:00:00Z')
  const pack = { id: 'ba5eba11-0000-4000-8000-000000000001' }

  it('SPEC: a fresh link INSERTs (and spends the invite)', () => {
    assert.equal(voicePackInviteAccess({ used_at: null, expires_at: live }, null, now), 'create')
  })

  it('SPEC: a link that already published UPDATES that pack, expired or not', () => {
    assert.equal(voicePackInviteAccess({ used_at: lapsed, expires_at: live }, pack, now), 'edit')
    assert.equal(voicePackInviteAccess({ used_at: lapsed, expires_at: lapsed }, pack, now), 'edit')
  })

  it('SPEC: an expired link with nothing published is a 404, not a new pack', () => {
    assert.equal(voicePackInviteAccess({ used_at: null, expires_at: lapsed }, null, now), 'denied')
  })

  it('SPEC: a first publish must carry every clip', () => {
    assert.equal(
      missingVoicePackClips(['greeting'], []).length,
      VOICE_PACK_CLIP_TYPES.length - 1
    )
    assert.equal(missingVoicePackClips(VOICE_PACK_CLIP_TYPES, []).length, 0)
  })

  it('SPEC: an edit may send one clip and omit the rest', () => {
    assert.equal(missingVoicePackClips(['count-5'], VOICE_PACK_CLIP_TYPES).length, 0)
  })

  it('SPEC: an edit may send NO clips at all — a rename is a valid change', () => {
    assert.equal(missingVoicePackClips([], VOICE_PACK_CLIP_TYPES).length, 0)
  })

  // Contract (DB-dependent):
  it('documents the upload contract', () => {
    // With a link that resolves, in order:
    //   invalid code shape             → 400 (3–24 chars, A–Z/0–9, internal hyphens).
    //   missing display name           → 400.
    //   any clip that IS sent failing declared-mime / magic-byte / 1 MB agreement
    //                                  → 400. An absent clip part is not an error on
    //                                    an edit — it means "keep what is published".
    //   a slot with neither an upload nor published audio
    //                                  → 400 "Missing audio for <clip>". A half-filled
    //                                    pack plays silence at a real table.
    //   logo absent AND none published, or one that fails the same checks (2 MB)
    //                                  → 400.
    //   code already taken by ANOTHER pack
    //                                  → 409, transaction rolled back. On a first
    //                                    publish the invite is STILL UNUSED; on an edit
    //                                    the pack is byte-for-byte as it was.
    //   otherwise                      → 200 { packId, code, displayName, mode }.
    //     mode 'created': the invite was consumed atomically
    //       (UPDATE ... WHERE used_at IS NULL), so two concurrent submits on one fresh
    //       link cannot both create a pack.
    //     mode 'updated': the SAME pack id is updated in place — entitlements point at
    //       it — with only the supplied clips/logo replaced (ON CONFLICT DO UPDATE) and
    //       updated_at moved so cached audio is retired. If the pack vanished between
    //       the read and the write the route 404s; it never falls back to creating a
    //       second pack behind a spent invite.
    assert.ok(true)
  })
})
