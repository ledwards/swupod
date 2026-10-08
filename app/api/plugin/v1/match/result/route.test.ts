// app/api/plugin/v1/match/result/route.test.ts
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

const REAL_SERVICE_KEY = process.env['PTP_SERVICE_KEY'] || 'test-service-key-for-unit-tests'

// Temporarily set PTP_SERVICE_KEY for tests
before(() => {
  process.env['PTP_SERVICE_KEY'] = REAL_SERVICE_KEY
})

after(() => {
  if (REAL_SERVICE_KEY === 'test-service-key-for-unit-tests') {
    delete process.env['PTP_SERVICE_KEY']
  }
})

// SPEC: POST /api/plugin/v1/match/result requires Authorization header
describe('POST /api/plugin/v1/match/result', () => {
  it('returns 401 without Authorization header', async () => {
    const { POST } = await import('./route.ts')
    const req = new Request('http://localhost/api/plugin/v1/match/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolShareId: 'test', result: 'win', matchId: 'wf-123' }),
    })
    const res = await POST(req)
    assert.equal(res.status, 401)  // SPEC: unauthorized without Bearer token
  })
})

// SPEC: the same real game can reach PTP under two ids — Wayfinder's server-side
// ingestion path historically sent `ing-<eventId>` while the live/replay path
// sends the bare `<eventId>`. They must collapse to ONE canonical id so the game
// is stored once (one casual_matches row, one W/L increment), not twice.
describe('canonicalMatchId', () => {
  it('OLD BUG: ing- and bare ids differ, so the same game stored as two rows', async () => {
    const { canonicalMatchId } = await import('./route.ts')
    // Demonstrates the pre-fix hazard: the two raw ids are NOT equal.
    assert.notEqual('ing-match_123', 'match_123')
    // FIXED: after normalization they are the same key.
    assert.equal(canonicalMatchId('ing-match_123'), canonicalMatchId('match_123'))
  })

  it('FIXED: strips a single leading ing- prefix', async () => {
    const { canonicalMatchId } = await import('./route.ts')
    assert.equal(canonicalMatchId('ing-match_1781946660329_9q3djx'), 'match_1781946660329_9q3djx')
  })

  it('FIXED: leaves a bare id unchanged', async () => {
    const { canonicalMatchId } = await import('./route.ts')
    assert.equal(canonicalMatchId('match_123'), 'match_123')
  })

  it('FIXED: only strips the FIRST ing- (mirrors /^ing-/ replace)', async () => {
    const { canonicalMatchId } = await import('./route.ts')
    assert.equal(canonicalMatchId('ing-ing-x'), 'ing-x')
  })

  it('FIXED: is idempotent — canonical of canonical is stable', async () => {
    const { canonicalMatchId } = await import('./route.ts')
    const once = canonicalMatchId('ing-match_123')
    assert.equal(canonicalMatchId(once), once)
  })
})
