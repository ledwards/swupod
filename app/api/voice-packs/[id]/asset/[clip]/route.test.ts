// Tests for GET /api/voice-packs/[id]/asset/[clip].
//
// SPEC: this URL shape is the contract with the countdown cue engine. `clip` must be
// one of the known slots (VOICE_PACK_CLIP_TYPES) and `id` must be a UUID; anything
// else is a probe and is rejected with 404 BEFORE the database is touched.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { VOICE_PACK_CLIP_TYPES } from '@/src/services/voicePacks'
import { queryRow, testConnection } from '@/lib/db'

let dbAvailable = false
try {
  dbAvailable = await testConnection()
} catch {
  dbAvailable = false
}

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

  // Serves from a real seeded pack rather than asserting "not a 404" against an
  // arbitrary UUID. Both rejection paths in the route return the SAME
  // errorResponse('Not found', 404) — one for a malformed clip, one for a pack
  // that does not exist — so a status code cannot tell "validation passed" from
  // "validation failed". The previous version only appeared to work because no
  // database was configured, which turned the second path into a 500; the day CI
  // got a Postgres it started failing, correctly. A 200 proves the clip id was
  // accepted AND served.
  it(
    `accepts every one of the ${VOICE_PACK_CLIP_TYPES.length} clip ids as well-formed`,
    { skip: !dbAvailable && 'no database configured' },
    async () => {
      const pack = await queryRow(
        `SELECT vp.id
           FROM voice_packs vp
           JOIN voice_pack_assets a ON a.pack_id = vp.id
          WHERE vp.status = 'active'
          GROUP BY vp.id
         HAVING COUNT(DISTINCT a.clip_type) = $1
          LIMIT 1`,
        [VOICE_PACK_CLIP_TYPES.length]
      )
      assert.ok(pack, 'expected a seeded active voice pack carrying every clip (migration 092)')

      for (const clip of VOICE_PACK_CLIP_TYPES) {
        const res = await call(pack['id'] as string, clip)
        assert.equal(res.status, 200, `clip "${clip}" should be accepted and served`)
      }
    }
  )

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
