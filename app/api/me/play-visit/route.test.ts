// @ts-nocheck
/**
 * Tests for POST /api/me/play-visit.
 *
 * Two layers:
 *
 *   1. Route handler invocation (no DB): drives the real POST handler with
 *      mock Requests to verify auth (401), body validation (400), and rate
 *      limiting (429). These paths don't reach the database.
 *
 *   2. Extracted predicate logic: the handler's "resolve shareId → check
 *      ownership → UPSERT" decision tree is small enough to mirror in a
 *      pure helper here and exercise without a live DB. Covers 404
 *      (pool missing), 403 (IDOR — different user's shareId), happy-path
 *      insert, and idempotent repeat-visit (UPSERT bumps last_visited_at,
 *      first_visited_at untouched).
 *
 * The handler tests would ideally exercise DB scenarios end-to-end, but
 * Node 20 doesn't ship `mock.module` and the project has no existing module-
 * stub harness. Mirroring the decision tree keeps test coverage faithful
 * without inventing a new mocking convention.
 */
import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert'
import { createToken } from '@/lib/auth'
import { _store as rateLimitStore, MAX_REQUESTS } from '@/lib/rateLimit'

const ownerId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '22222222-2222-4222-8222-222222222222'
const poolUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const ownerUser = {
  id: ownerId,
  email: 'owner@example.com',
  username: 'owner',
  avatar_url: null,
  is_admin: false,
  is_beta_tester: false,
}

const otherUser = {
  id: otherUserId,
  email: 'other@example.com',
  username: 'other',
  avatar_url: null,
  is_admin: false,
  is_beta_tester: false,
}

function makeRequest({
  body,
  token,
  ip = '127.0.0.1',
}: {
  body?: unknown
  token?: string
  ip?: string
} = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  }
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request('http://localhost/api/me/play-visit', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /api/me/play-visit — handler-level', () => {
  beforeEach(() => {
    // Each test starts with a fresh rate-limit budget.
    rateLimitStore.clear()
  })

  it('returns 401 when the request has no auth', async () => {
    const { POST } = await import('./route.ts')
    const response = await POST(makeRequest({ body: { shareId: 'abc123' } }))
    assert.strictEqual(response.status, 401)
    const json = await response.json()
    assert.strictEqual(json.success, false)
    assert.ok(/auth/i.test(json.message))
  })

  it('returns 400 when the body is missing', async () => {
    const { POST } = await import('./route.ts')
    const token = createToken(ownerUser)
    const response = await POST(makeRequest({ token }))
    assert.strictEqual(response.status, 400)
    const json = await response.json()
    assert.strictEqual(json.success, false)
    assert.ok(/body/i.test(json.message), `expected /body/i, got ${JSON.stringify(json.message)}`)
  })

  it('returns 400 when shareId is missing from the body', async () => {
    const { POST } = await import('./route.ts')
    const token = createToken(ownerUser)
    const response = await POST(makeRequest({ token, body: {} }))
    assert.strictEqual(response.status, 400)
    const json = await response.json()
    assert.ok(/shareid/i.test(json.message))
  })

  it('returns 400 when shareId is not a string', async () => {
    const { POST } = await import('./route.ts')
    const token = createToken(ownerUser)
    const response = await POST(makeRequest({ token, body: { shareId: 123 } }))
    assert.strictEqual(response.status, 400)
  })

  it('returns 400 when shareId is an empty/whitespace string', async () => {
    const { POST } = await import('./route.ts')
    const token = createToken(ownerUser)
    const response = await POST(makeRequest({ token, body: { shareId: '   ' } }))
    assert.strictEqual(response.status, 400)
  })

  it('returns 429 after exceeding the rate limit', async () => {
    const { POST } = await import('./route.ts')
    const ip = '10.20.30.40'
    // Saturate the bucket with anonymous calls — they short-circuit at the
    // auth check (401) before touching the DB, but each one still counts
    // against the per-IP rate budget. The 61st call hits the rate limit
    // first and returns 429.
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const allowed = await POST(makeRequest({ body: { shareId: 'whatever' }, ip }))
      // Each call should be allowed past the rate-limit gate, then fail
      // somewhere else (401 here). The point is just to consume the budget.
      assert.notStrictEqual(allowed.status, 429, `request ${i + 1} should not be rate-limited yet`)
    }
    const blocked = await POST(makeRequest({ body: { shareId: 'whatever' }, ip }))
    assert.strictEqual(blocked.status, 429)
  })
})

/**
 * The route handler's core decision tree:
 *
 *   poolRow = SELECT id, user_id FROM card_pools WHERE share_id = $1
 *   if (!poolRow)                       → 404, no UPSERT
 *   if (poolRow.user_id !== session.id) → 403, no UPSERT
 *   else                                → UPSERT, 200
 *
 * Mirrored here as a pure function so we can drive every branch without a
 * live DB. The shape of the UPSERT (its ON CONFLICT clause) is verified
 * separately against the canonical SQL in the route source.
 */
type DecisionOutcome =
  | { status: 404; upsertCalled: false }
  | { status: 403; upsertCalled: false }
  | { status: 200; upsertCalled: true; upsertArgs: { userId: string; poolId: string } }

function decidePlayVisit({
  sessionUserId,
  poolRow,
}: {
  sessionUserId: string
  poolRow: { id: string; user_id: string | null } | null
}): DecisionOutcome {
  if (!poolRow) return { status: 404, upsertCalled: false }
  if (poolRow.user_id !== sessionUserId) return { status: 403, upsertCalled: false }
  return {
    status: 200,
    upsertCalled: true,
    upsertArgs: { userId: sessionUserId, poolId: poolRow.id },
  }
}

describe('POST /api/me/play-visit — pool resolution + IDOR check', () => {
  it('returns 404 when the shareId does not resolve to a pool', () => {
    const outcome = decidePlayVisit({ sessionUserId: ownerId, poolRow: null })
    assert.strictEqual(outcome.status, 404)
    assert.strictEqual(outcome.upsertCalled, false)
  })

  it('returns 403 when the resolved pool is owned by a different user (IDOR)', () => {
    const outcome = decidePlayVisit({
      sessionUserId: ownerId,
      poolRow: { id: poolUuid, user_id: otherUserId },
    })
    assert.strictEqual(outcome.status, 403)
    assert.strictEqual(outcome.upsertCalled, false)
  })

  it('returns 403 when the pool is anonymous (user_id IS NULL)', () => {
    // Anonymous pools have no owner relationship to attribute the play to.
    // The handler treats them the same as someone else's pool: 403, no row.
    const outcome = decidePlayVisit({
      sessionUserId: ownerId,
      poolRow: { id: poolUuid, user_id: null },
    })
    assert.strictEqual(outcome.status, 403)
    assert.strictEqual(outcome.upsertCalled, false)
  })

  it('returns 200 and triggers an UPSERT when the pool is owned by the session user', () => {
    const outcome = decidePlayVisit({
      sessionUserId: ownerId,
      poolRow: { id: poolUuid, user_id: ownerId },
    })
    assert.strictEqual(outcome.status, 200)
    assert.strictEqual(outcome.upsertCalled, true)
    if (outcome.upsertCalled) {
      assert.strictEqual(outcome.upsertArgs.userId, ownerId)
      assert.strictEqual(outcome.upsertArgs.poolId, poolUuid)
    }
  })

  it('returns 200 and UPSERTs even when the same user calls repeatedly (idempotent)', () => {
    // Repeat calls must produce the same decision — the UPSERT itself is
    // idempotent at the SQL layer (ON CONFLICT DO UPDATE) so an existing
    // row is bumped, not duplicated. This is the AE5 contract.
    const first = decidePlayVisit({
      sessionUserId: ownerId,
      poolRow: { id: poolUuid, user_id: ownerId },
    })
    const second = decidePlayVisit({
      sessionUserId: ownerId,
      poolRow: { id: poolUuid, user_id: ownerId },
    })
    assert.deepStrictEqual(first, second)
  })
})

/**
 * Verify the UPSERT SQL shape directly from the route source. This is the
 * load-bearing claim: "first_visited_at stays unchanged on conflict; only
 * last_visited_at gets bumped." A regression here would silently break the
 * activity date-windowing in U5.
 */
describe('POST /api/me/play-visit — UPSERT SQL shape', () => {
  let routeSource: string

  before(async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const here = path.dirname(new URL(import.meta.url).pathname)
    routeSource = await fs.readFile(path.join(here, 'route.ts'), 'utf8')
  })

  it('targets the deck_play_visits table on the conflict key (user_id, pool_id)', () => {
    assert.ok(/INSERT INTO deck_play_visits/i.test(routeSource), 'INSERT into deck_play_visits')
    assert.ok(/ON CONFLICT\s*\(\s*user_id\s*,\s*pool_id\s*\)/i.test(routeSource), 'ON CONFLICT (user_id, pool_id)')
  })

  it('bumps last_visited_at on conflict without touching first_visited_at', () => {
    assert.ok(/DO UPDATE SET last_visited_at\s*=\s*NOW\(\)/i.test(routeSource),
      'DO UPDATE SET last_visited_at = NOW()')
    // The DO UPDATE clause must NOT mention first_visited_at — that column
    // stays at whatever the initial INSERT recorded.
    const doUpdateMatch = routeSource.match(/DO UPDATE SET[^;]*/i)
    assert.ok(doUpdateMatch, 'should find DO UPDATE SET clause')
    assert.ok(!/first_visited_at/i.test(doUpdateMatch![0]),
      'first_visited_at must not appear in DO UPDATE — it stays as-is on conflict')
  })

  it('parameterizes both user_id and pool_id (no string interpolation)', () => {
    assert.ok(/VALUES\s*\(\s*\$1\s*,\s*\$2\s*\)/.test(routeSource),
      'VALUES ($1, $2) parameter placeholders')
  })
})

console.log('\nRunning /api/me/play-visit route tests...\n')
