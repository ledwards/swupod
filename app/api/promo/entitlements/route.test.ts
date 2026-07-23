// Tests for GET /api/promo/entitlements (plan U4).
//
// The DB-free paths (unknown campaign, anonymous → all-false) run against the real
// handler. The owned-tier read is covered end-to-end in tests/e2e/gc-promo-packs.spec.ts.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from './route'

const req = (qs: string): NextRequest =>
  new NextRequest(`http://localhost/api/promo/entitlements${qs}`, { method: 'GET' })

describe('GET /api/promo/entitlements', () => {
  it('returns 400 for an unknown campaign', async () => {
    const res = await GET(req('?campaign=nope'))
    assert.equal(res.status, 400)
  })

  it('returns 400 when the campaign param is missing', async () => {
    const res = await GET(req(''))
    assert.equal(res.status, 400)
  })

  it('returns all-false for an anonymous caller (no 401)', async () => {
    const res = await GET(req('?campaign=gc2026'))
    assert.equal(res.status, 200)
    const json = (await res.json()) as { data: { campaign: string; silver: boolean; black: boolean } }
    assert.equal(json.data.campaign, 'gc2026')
    assert.equal(json.data.silver, false)
    assert.equal(json.data.black, false)
  })
})
