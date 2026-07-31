// Tests for GET /api/voice-packs/entitlements.
//
// SPEC: anonymous callers get an EMPTY LIST, not a 401 (precedent:
// app/api/promo/entitlements). The host picker renders on surfaces that may be viewed
// signed-out, and a 401 would turn a normal empty state into an error path.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from './route'

function get(): NextRequest {
  return new NextRequest('http://localhost/api/voice-packs/entitlements')
}

describe('GET /api/voice-packs/entitlements', () => {
  it('SPEC: an anonymous caller gets 200 with an empty pack list, not 401', async () => {
    const res = await GET(get())
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.deepEqual(json.data.packs, [])
  })

  it('never touches the database for an anonymous caller', async () => {
    // No DATABASE_URL is configured in the test environment, so a query would throw
    // "Database not configured" and surface as a 500. A clean 200 proves the
    // anonymous short-circuit happens before any DB access.
    const res = await GET(get())
    assert.equal(res.status, 200)
  })

  // Contract (DB-dependent):
  it('documents the entitlement read contract', () => {
    // Signed in → { packs: [{ id, code, displayName, creatorName, grantedAt,
    //   logoUrl, clips[], assetUrls{clip: '/api/voice-packs/<id>/asset/<clip>'} }] },
    //   newest grant first, packs with status <> 'active' excluded.
    assert.ok(true)
  })
})
