import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { applyRateLimit, getClientIp, _store, MAX_REQUESTS } from './rateLimit'

function makeRequest(ip = '1.2.3.4'): Request {
  return new Request('http://localhost/api/test', {
    headers: { 'x-forwarded-for': ip },
  })
}

describe('applyRateLimit', () => {
  beforeEach(() => {
    _store.clear()
  })

  it('allows requests under the limit', () => {
    const req = makeRequest()
    const result = applyRateLimit(req)
    assert.strictEqual(result, null, 'Should allow first request')
  })

  it('blocks after exceeding the limit', () => {
    const req = makeRequest()
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const result = applyRateLimit(req)
      assert.strictEqual(result, null, `Request ${i + 1} should be allowed`)
    }
    // 61st request should be blocked
    const blocked = applyRateLimit(req)
    assert.notStrictEqual(blocked, null, 'Should block after limit')
    assert.strictEqual(blocked!.status, 429)
  })

  it('tracks remaining count correctly', () => {
    const req = makeRequest()
    for (let i = 0; i < MAX_REQUESTS; i++) {
      applyRateLimit(req)
    }
    const blocked = applyRateLimit(req)
    assert.notStrictEqual(blocked, null)
    assert.strictEqual(blocked!.headers.get('X-RateLimit-Remaining'), '0')
  })

  it('sets Retry-After header on 429', () => {
    const req = makeRequest()
    for (let i = 0; i < MAX_REQUESTS; i++) {
      applyRateLimit(req)
    }
    const blocked = applyRateLimit(req)
    assert.notStrictEqual(blocked, null)
    const retryAfter = parseInt(blocked!.headers.get('Retry-After')!, 10)
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After should be 1-60, got ${retryAfter}`)
  })

  it('tracks different IPs independently', () => {
    const req1 = makeRequest('10.0.0.1')
    const req2 = makeRequest('10.0.0.2')

    for (let i = 0; i < MAX_REQUESTS; i++) {
      applyRateLimit(req1)
    }
    // IP 1 is blocked
    assert.notStrictEqual(applyRateLimit(req1), null)
    // IP 2 is still allowed
    assert.strictEqual(applyRateLimit(req2), null)
  })

  it('resets after window expires', () => {
    const req = makeRequest()
    for (let i = 0; i < MAX_REQUESTS; i++) {
      applyRateLimit(req)
    }
    assert.notStrictEqual(applyRateLimit(req), null, 'Should be blocked')

    // Manually expire the window
    const entry = _store.get('1.2.3.4')!
    entry.resetAt = Date.now() - 1

    // Should be allowed again
    assert.strictEqual(applyRateLimit(req), null, 'Should be allowed after window reset')
  })
})

describe('getClientIp proxy trust (U8)', () => {
  beforeEach(() => {
    _store.clear()
    delete process.env['TRUST_PROXY_HOPS']
  })

  afterEach(() => {
    delete process.env['TRUST_PROXY_HOPS']
  })

  it('takes the LAST x-forwarded-for entry with the default single trusted hop', () => {
    const req = makeRequest('6.6.6.6, 203.0.113.9')
    assert.strictEqual(getClientIp(req), '203.0.113.9')
  })

  it('spoofed leading entries cannot fragment the rate-limit key', () => {
    // Same real client, different client-prepended garbage each request.
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const req = makeRequest(`spoof-${i}, 203.0.113.9`)
      assert.strictEqual(applyRateLimit(req), null, `Request ${i + 1} should be allowed`)
    }
    const blocked = applyRateLimit(makeRequest('spoof-final, 203.0.113.9'))
    assert.notStrictEqual(blocked, null, 'Real IP should trip the limit despite spoofed prefixes')
    assert.strictEqual(blocked!.status, 429)
  })

  it('TRUST_PROXY_HOPS=2 takes the second entry from the right', () => {
    process.env['TRUST_PROXY_HOPS'] = '2'
    const req = makeRequest('spoofed, 198.51.100.7, 10.0.0.1')
    assert.strictEqual(getClientIp(req), '198.51.100.7')
  })

  it('fewer entries than trusted hops falls back to the leftmost entry', () => {
    process.env['TRUST_PROXY_HOPS'] = '3'
    const req = makeRequest('198.51.100.7')
    assert.strictEqual(getClientIp(req), '198.51.100.7')
  })

  it('TRUST_PROXY_HOPS=0 ignores the header entirely (untrusted in bare dev)', () => {
    process.env['TRUST_PROXY_HOPS'] = '0'
    assert.strictEqual(getClientIp(makeRequest('203.0.113.9')), 'unknown')
    assert.strictEqual(getClientIp(makeRequest('9.9.9.9')), 'unknown')
  })

  it('missing header maps to the shared unknown bucket', () => {
    const req = new Request('http://localhost/api/test')
    assert.strictEqual(getClientIp(req), 'unknown')
  })

  it('invalid TRUST_PROXY_HOPS values fall back to the default of 1', () => {
    process.env['TRUST_PROXY_HOPS'] = 'banana'
    assert.strictEqual(getClientIp(makeRequest('a, b, 203.0.113.9')), '203.0.113.9')
    process.env['TRUST_PROXY_HOPS'] = '-2'
    assert.strictEqual(getClientIp(makeRequest('a, 203.0.113.9')), '203.0.113.9')
  })
})
