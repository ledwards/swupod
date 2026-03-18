// @ts-nocheck
/**
 * Tests for GET /api/private/user-data
 *
 * Private server-to-server endpoint for SWUTeam integration.
 * Authenticated via PTP_SERVICE_KEY, not user sessions.
 * Returns pools, built decks, and draft picks for a discord_id.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'

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

function makeRequest(path: string, serviceKey?: string): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': '127.0.0.1' }
  if (serviceKey) {
    headers['authorization'] = `Bearer ${serviceKey}`
  }
  return new Request(`http://localhost${path}`, { headers })
}

describe('GET /api/private/user-data - auth enforcement', () => {
  it('returns 401 without authorization header', async () => {
    const { GET } = await import('./route.ts')
    const request = makeRequest('/api/private/user-data?discord_id=123')
    const response = await GET(request)
    const body = await response.json()
    assert.strictEqual(response.status, 401)
    assert.strictEqual(body.success, false)
  })

  it('returns 401 with wrong service key', async () => {
    const { GET } = await import('./route.ts')
    const request = makeRequest('/api/private/user-data?discord_id=123', 'wrong-key')
    const response = await GET(request)
    assert.strictEqual(response.status, 401)
  })

  it('returns 401 with user JWT token (not service key)', async () => {
    // Service key auth is separate from user JWT auth — a valid user
    // session token should NOT grant access to private endpoints.
    const { createToken } = await import('@/lib/auth')
    const userToken = createToken({
      id: 'test-user',
      email: 'test@example.com',
      username: 'testuser',
      is_admin: false,
      is_beta_tester: false,
    })
    const { GET } = await import('./route.ts')
    const request = makeRequest('/api/private/user-data?discord_id=123', userToken)
    const response = await GET(request)
    assert.strictEqual(response.status, 401)
  })
})

describe('GET /api/private/user-data - parameter validation', () => {
  it('returns 400 when discord_id is missing', async () => {
    const { GET } = await import('./route.ts')
    const request = makeRequest('/api/private/user-data', REAL_SERVICE_KEY)
    const response = await GET(request)
    const body = await response.json()
    assert.strictEqual(response.status, 400)
    assert.strictEqual(body.success, false)
    assert.ok(body.message.includes('discord_id'))
  })
})

describe('GET /api/private/user-data - response shape', () => {
  const hasDb = !!(process.env['POSTGRES_URL'] || process.env['DATABASE_URL'])

  it('returns empty arrays for unknown discord_id (not 404)', { skip: !hasDb && 'no database configured' }, async () => {
    const { GET } = await import('./route.ts')
    const request = makeRequest(
      '/api/private/user-data?discord_id=000000000000000000',
      REAL_SERVICE_KEY
    )
    const response = await GET(request)
    const body = await response.json()
    assert.strictEqual(response.status, 200)
    assert.strictEqual(body.success, true)
    assert.strictEqual(body.data.user, null)
    assert.ok(Array.isArray(body.data.pools))
    assert.strictEqual(body.data.pools.length, 0)
    assert.ok(Array.isArray(body.data.builtDecks))
    assert.strictEqual(body.data.builtDecks.length, 0)
    assert.ok(Array.isArray(body.data.draftPicks))
    assert.strictEqual(body.data.draftPicks.length, 0)
  })

  it('response has correct top-level keys', { skip: !hasDb && 'no database configured' }, async () => {
    const { GET } = await import('./route.ts')
    const request = makeRequest(
      '/api/private/user-data?discord_id=000000000000000000',
      REAL_SERVICE_KEY
    )
    const response = await GET(request)
    const body = await response.json()
    const keys = Object.keys(body.data).sort()
    assert.deepStrictEqual(keys, ['builtDecks', 'draftPicks', 'pools', 'user'])
  })
})

describe('GET /api/private/user-data - standard response format', () => {
  it('error responses follow PTP API schema { success, data, message }', async () => {
    // Use the 400 (missing discord_id) case — doesn't need DB
    const { GET } = await import('./route.ts')
    const request = makeRequest('/api/private/user-data', REAL_SERVICE_KEY)
    const response = await GET(request)
    const body = await response.json()
    assert.ok('success' in body, 'response must have success field')
    assert.ok('data' in body, 'response must have data field')
    assert.ok('message' in body, 'response must have message field')
    assert.strictEqual(body.success, false)
  })

  it('auth error responses follow PTP API schema { success, data, message }', async () => {
    const { GET } = await import('./route.ts')
    const request = makeRequest('/api/private/user-data?discord_id=123')
    const response = await GET(request)
    const body = await response.json()
    assert.ok('success' in body, 'response must have success field')
    assert.ok('data' in body, 'response must have data field')
    assert.ok('message' in body, 'response must have message field')
    assert.strictEqual(body.success, false)
  })
})

console.log('\n🔒 Running /api/private/user-data tests...\n')
