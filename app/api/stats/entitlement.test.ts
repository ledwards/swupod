// @ts-nocheck
/**
 * Server-side entitlement guard for the locked /stats cohorts (Competitive /
 * Top Players). See lib/auth.requireFullStatsAccess.
 *
 * THE HOLE this closes: the /stats page gated the "Competitive" (tournamentOnly)
 * and "Top Players" (topPlayersOnly) columns ONLY in the client. The API routes
 * that back those columns had no server-side check, so a scraper / devtools user
 * could call them directly and read the locked numbers.
 *
 * The guard is defined ONCE (lib/auth.requireFullStatsAccess) and wired into
 * every cohort-scoped route. These tests prove, per route:
 *   - anonymous       → 403 for tournamentOnly / topPlayersOnly
 *   - non-patron      → 403 for tournamentOnly / topPlayersOnly
 *   - patron / admin  → NOT 403 (full data reaches them)
 *   - You / All        → still 200 for anonymous + non-patron (never gated)
 *
 * Runs against the local swupod_test Postgres (same convention as
 * app/api/draft/draft-advance-concurrency.test.ts). Skips loudly if the test
 * DB is unreachable — the entitlement predicate reads users.is_patron /
 * users.is_admin, which cannot be mocked meaningfully here.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

// lib/db reads the connection string at module init — pin it to the test DB
// before the dynamic imports below. Never let a shell pointing at prod get
// written to by tests.
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL
// Deterministic secret so createToken/getSession agree inside the test process.
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] || 'stats-entitlement-test-secret'

const db = await import('@/lib/db')
const { query, queryRow, closePool, testConnection } = db
const { createToken } = await import('@/lib/auth')

const dp = await import('@/app/api/stats/draft-picks/route')
const cd = await import('@/app/api/stats/card-data/route')
const ls = await import('@/app/api/stats/leader-selection/route')
const di = await import('@/app/api/stats/deck-inclusion/route')

const ROUTES = [
  { name: 'draft-picks', path: '/api/stats/draft-picks', GET: dp.GET },
  { name: 'card-data', path: '/api/stats/card-data', GET: cd.GET },
  { name: 'leader-selection', path: '/api/stats/leader-selection', GET: ls.GET },
  { name: 'deck-inclusion', path: '/api/stats/deck-inclusion', GET: di.GET },
]

let dbAvailable = false
try {
  dbAvailable = await testConnection()
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `⚠️  entitlement.test.ts: test database unreachable at ${TEST_DB_URL} — skipping. ` +
      'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

function makeReq(path, token) {
  const headers = {}
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request(`http://localhost${path}`, { headers })
}

const tag = randomUUID().slice(0, 8)
const seededUserIds = []

let patronToken = ''
let adminToken = ''
let nonPatronToken = ''
let nonPatronId = ''

async function seedUser({ isPatron = false, isAdmin = false }) {
  const row = await queryRow(
    `INSERT INTO users (username, email, is_patron, is_admin)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`ent-${tag}-${seededUserIds.length}`, `ent-${tag}-${seededUserIds.length}@example.test`, isPatron, isAdmin]
  )
  seededUserIds.push(row.id)
  return row.id
}

before(async () => {
  if (!dbAvailable) return
  const patronId = await seedUser({ isPatron: true })
  const adminId = await seedUser({ isAdmin: true })
  nonPatronId = await seedUser({})

  // Patron/non-patron carry NO is_admin claim in the token — entitlement for
  // them is resolved from the DB is_patron flag, exactly like the client's
  // patron-status result. Admin carries the is_admin claim.
  patronToken = createToken({ id: patronId, email: `p-${tag}@example.test`, username: 'p', is_admin: false, is_beta_tester: false })
  adminToken = createToken({ id: adminId, email: `a-${tag}@example.test`, username: 'a', is_admin: true, is_beta_tester: false })
  nonPatronToken = createToken({ id: nonPatronId, email: `n-${tag}@example.test`, username: 'n', is_admin: false, is_beta_tester: false })
})

after(async () => {
  if (!dbAvailable) return
  if (seededUserIds.length) {
    await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [seededUserIds])
  }
  await closePool()
})

for (const route of ROUTES) {
  describe(`GET ${route.path} — server-side entitlement guard`, () => {
    for (const cohort of ['tournamentOnly', 'topPlayersOnly']) {
      it(`denies anonymous with 403 (${cohort})`, async (t) => {
        if (!dbAvailable) return t.skip('test DB unreachable')
        const res = await route.GET(makeReq(`${route.path}?${cohort}=true`))
        assert.strictEqual(res.status, 403, `expected 403, got ${res.status}`)
      })

      it(`denies a non-patron with 403 (${cohort})`, async (t) => {
        if (!dbAvailable) return t.skip('test DB unreachable')
        const res = await route.GET(makeReq(`${route.path}?${cohort}=true`, nonPatronToken))
        assert.strictEqual(res.status, 403, `expected 403, got ${res.status}`)
      })

      it(`allows a patron (not 403) (${cohort})`, async (t) => {
        if (!dbAvailable) return t.skip('test DB unreachable')
        const res = await route.GET(makeReq(`${route.path}?${cohort}=true`, patronToken))
        assert.notStrictEqual(res.status, 403, 'patron must not be gated')
        assert.strictEqual(res.status, 200, `patron expected 200, got ${res.status}`)
      })

      it(`allows an admin (not 403) (${cohort})`, async (t) => {
        if (!dbAvailable) return t.skip('test DB unreachable')
        const res = await route.GET(makeReq(`${route.path}?${cohort}=true`, adminToken))
        assert.notStrictEqual(res.status, 403, 'admin must not be gated')
        assert.strictEqual(res.status, 200, `admin expected 200, got ${res.status}`)
      })
    }

    it('lets a NON-patron read the "All" cohort (no flags) → 200', async (t) => {
      if (!dbAvailable) return t.skip('test DB unreachable')
      const res = await route.GET(makeReq(`${route.path}`, nonPatronToken))
      assert.strictEqual(res.status, 200, `All cohort expected 200, got ${res.status}`)
    })

    it('lets an ANONYMOUS caller read the "All" cohort (no flags) → 200', async (t) => {
      if (!dbAvailable) return t.skip('test DB unreachable')
      const res = await route.GET(makeReq(`${route.path}`))
      assert.strictEqual(res.status, 200, `anon All expected 200, got ${res.status}`)
    })

    it('lets a NON-patron read their own "You" cohort (userId=self) → 200', async (t) => {
      if (!dbAvailable) return t.skip('test DB unreachable')
      const res = await route.GET(makeReq(`${route.path}?userId=${nonPatronId}`, nonPatronToken))
      assert.strictEqual(res.status, 200, `You cohort expected 200, got ${res.status}`)
    })
  })
}

console.log('\n🛡️  Running /stats cohort entitlement guard tests...\n')
