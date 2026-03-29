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
