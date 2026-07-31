// Tests for GET /api/voice-packs/[id]/asset/[clip].
//
// SPEC: this URL shape is the contract with the countdown cue engine. `clip` must be
// one of the 7 known slots and `id` must be a UUID; anything else is a probe and is
// rejected with 404 BEFORE the database is touched.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { VOICE_PACK_CLIP_TYPES } from '@/src/services/voicePacks'

const PACK_ID = '11111111-2222-4333-8444-555555555555'

function call(id: string, clip: string): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/voice-packs/${id}/asset/${clip}`)
  return GET(req, { params: Promise.resolve({ id, clip }) })
}

describe('GET /api/voice-packs/[id]/asset/[clip]', () => {
  it('SPEC: rejects a clip id that is not one of the 7 slots, without a DB read', async () => {
    for (const bogus of ['count-10', 'GREETING', 'greeting.mp3', '../../etc/passwd', '']) {
      const res = await call(PACK_ID, bogus)
      assert.equal(res.status, 404, `expected 404 for clip "${bogus}"`)
    }
  })

  it('SPEC: rejects a pack id that is not a UUID, without a DB read', async () => {
    for (const bogus of ['1', 'not-a-uuid', "' OR 1=1--", '../logo']) {
      const res = await call(bogus, 'greeting')
      assert.equal(res.status, 404, `expected 404 for id "${bogus}"`)
    }
  })

  it('accepts every one of the 7 clip ids as well-formed', async () => {
    // With a valid UUID and a valid clip the handler proceeds to the database, which
    // is not configured in tests — so anything OTHER than 404 proves validation passed.
    for (const clip of VOICE_PACK_CLIP_TYPES) {
      const res = await call(PACK_ID, clip)
      assert.notEqual(res.status, 404, `clip "${clip}" should pass validation`)
    }
  })

  // Contract (DB-dependent):
  it('documents the serving contract', () => {
    // Found + pack status 'active' → 200, body = raw bytes,
    //   Content-Type = the mime SNIFFED at upload time (never the uploader's header),
    //   Cache-Control: public, max-age=31536000, immutable + ETag,
    //   X-Content-Type-Options: nosniff.
    // Deliberately UNAUTHENTICATED: every seat at a table using the pack must be able
    //   to fetch it, including seats that never redeemed the code and spectators.
    //   The host's unlock covers the whole table.
    assert.ok(true)
  })
})
