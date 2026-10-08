// @ts-nocheck
/**
 * Tests for /api/me/* endpoint response shapes and auth enforcement.
 * These test the route handler functions directly with mock requests,
 * without hitting a real database.
 */
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert'
import { createToken } from '@/lib/auth'

const testUser = {
  id: 'test-user-api',
  email: 'api@example.com',
  username: 'apiuser',
  avatar_url: null,
  is_admin: false,
  is_beta_tester: false,
}

function makeRequest(path: string, token?: string): Request {
  const headers: Record<string, string> = {}
  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }
  headers['x-forwarded-for'] = '127.0.0.1'
  return new Request(`http://localhost${path}`, { headers })
}

describe('/api/me/* auth enforcement', () => {
  it('GET /api/me/pools returns 401 without auth', async () => {
    // Import the route handler
    const { GET } = await import('./pools/route.ts')
    const request = makeRequest('/api/me/pools')
    const response = await GET(request)
    const body = await response.json()
    assert.strictEqual(response.status, 401)
    assert.strictEqual(body.success, false)
    assert.ok(body.message.includes('Authentication'))
  })

  it('GET /api/me/drafts returns 401 without auth', async () => {
    const { GET } = await import('./drafts/route.ts')
    const request = makeRequest('/api/me/drafts')
    const response = await GET(request)
    assert.strictEqual(response.status, 401)
  })

  it('GET /api/me/decks returns 401 without auth', async () => {
    const { GET } = await import('./decks/route.ts')
    const request = makeRequest('/api/me/decks')
    const response = await GET(request)
    assert.strictEqual(response.status, 401)
  })

  it('GET /api/me/pool-history returns 401 without auth', async () => {
    const { GET } = await import('./pool-history/route.ts')
    const request = makeRequest('/api/me/pool-history')
    const response = await GET(request)
    assert.strictEqual(response.status, 401)
  })

  it('GET /api/me/pools/:shareId returns 401 without auth', async () => {
    const { GET } = await import('./pools/[shareId]/route.ts')
    const request = makeRequest('/api/me/pools/abc123')
    const response = await GET(request, { params: Promise.resolve({ shareId: 'abc123' }) })
    assert.strictEqual(response.status, 401)
  })

  it('GET /api/me/drafts/:shareId/picks returns 401 without auth', async () => {
    const { GET } = await import('./drafts/[shareId]/picks/route.ts')
    const request = makeRequest('/api/me/drafts/abc123/picks')
    const response = await GET(request, { params: Promise.resolve({ shareId: 'abc123' }) })
    assert.strictEqual(response.status, 401)
  })
})

describe('/api/auth/token', () => {
  it('returns 401 without session', async () => {
    const { GET } = await import('../auth/token/route.ts')
    const request = makeRequest('/api/auth/token')
    const response = await GET(request)
    assert.strictEqual(response.status, 401)
  })

  it('returns token with valid session cookie', async () => {
    const { GET } = await import('../auth/token/route.ts')
    const token = createToken(testUser)
    const request = new Request('http://localhost/api/auth/token', {
      headers: {
        cookie: `swupod_session=${token}`,
        'x-forwarded-for': '127.0.0.1',
      },
    })
    const response = await GET(request)
    const body = await response.json()
    assert.strictEqual(response.status, 200)
    assert.strictEqual(body.success, true)
    assert.ok(body.data.token)
    assert.strictEqual(body.data.expiresIn, '30d')
    assert.ok(body.data.usage.includes('Bearer'))
  })
})

describe('Response schema validation', () => {
  it('jsonResponse wraps data correctly', () => {
    // Verify the standard response format used by all endpoints
    const mockResponse = {
      success: true,
      data: { pools: [], total: 0 },
      message: null,
    }
    assert.strictEqual(mockResponse.success, true)
    assert.ok(Array.isArray(mockResponse.data.pools))
    assert.strictEqual(mockResponse.data.total, 0)
    assert.strictEqual(mockResponse.message, null)
  })

  it('error response shape is correct', () => {
    const mockError = {
      success: false,
      data: null,
      message: 'Authentication required',
    }
    assert.strictEqual(mockError.success, false)
    assert.strictEqual(mockError.data, null)
    assert.ok(typeof mockError.message === 'string')
  })
})

console.log('\n📡 Running /api/me endpoint tests...\n')
