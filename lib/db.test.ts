// Tests for the transaction primitives in lib/db.ts.
//
// These are the first DB-backed tests in the repo: they run against a real
// local Postgres (transactions and advisory locks cannot be meaningfully
// mocked). The target database is deliberately NOT read from DATABASE_URL /
// POSTGRES_URL so a shell pointing at the Railway dev/prod DB can never be
// written to by tests. Override with SWUPOD_TEST_DATABASE_URL if your local
// test DB lives elsewhere.
//
// Setup (one-time): createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes
//
// If the test DB is unreachable the suite skips loudly instead of failing,
// so machines without local Postgres can still run `npm run test`.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

// lib/db.ts reads the connection string at module init — pin it to the test
// DB before the dynamic import below.
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('./db.ts')
const { query, queryRow, queryRows, withTransaction, withAdvisoryLock, getPoolStats, closePool } = db

const SCRATCH_TABLE = `tx_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `⚠️  lib/db.test.ts: test database unreachable at ${TEST_DB_URL} — skipping DB-backed transaction tests. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

describe('withTransaction', { skip: !dbAvailable }, () => {
  before(async () => {
    await query(`CREATE TABLE IF NOT EXISTS ${SCRATCH_TABLE} (id SERIAL PRIMARY KEY, label TEXT NOT NULL, n INT NOT NULL DEFAULT 0)`)
  })

  after(async () => {
    await query(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`)
  })

  it('commits all writes on success', async () => {
    await withTransaction(async (tx) => {
      await tx.query(`INSERT INTO ${SCRATCH_TABLE} (label) VALUES ('commit-a')`)
      await tx.query(`INSERT INTO ${SCRATCH_TABLE} (label) VALUES ('commit-b')`)
    })

    const rows = await queryRows(`SELECT label FROM ${SCRATCH_TABLE} WHERE label LIKE 'commit-%' ORDER BY label`)
    assert.deepStrictEqual(rows.map(r => r.label), ['commit-a', 'commit-b'])
  })

  it('rolls back ALL writes when an error is thrown between them', async () => {
    await assert.rejects(
      withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${SCRATCH_TABLE} (label) VALUES ('rollback-a')`)
        throw new Error('boom between writes')
      }),
      /boom between writes/
    )

    const rows = await queryRows(`SELECT label FROM ${SCRATCH_TABLE} WHERE label LIKE 'rollback-%'`)
    assert.strictEqual(rows.length, 0, 'no rows from the failed transaction may persist')
  })

  it('returns the callback result', async () => {
    const result = await withTransaction(async (tx) => {
      const row = await tx.queryRow('SELECT 41 + 1 AS answer')
      return row?.answer
    })
    assert.strictEqual(result, 42)
  })

  it('FOR UPDATE inside withTransaction blocks a concurrent transaction on the same row until commit', async () => {
    await query(`INSERT INTO ${SCRATCH_TABLE} (label, n) VALUES ('locked-row', 0)`)

    const events: string[] = []

    const first = withTransaction(async (tx) => {
      await tx.query(`SELECT * FROM ${SCRATCH_TABLE} WHERE label = 'locked-row' FOR UPDATE`)
      events.push('first:locked')
      // Hold the lock long enough that the second txn must wait on it
      await new Promise(resolve => setTimeout(resolve, 300))
      await tx.query(`UPDATE ${SCRATCH_TABLE} SET n = n + 1 WHERE label = 'locked-row'`)
      events.push('first:committing')
    })

    // Give the first transaction time to grab the row lock
    await new Promise(resolve => setTimeout(resolve, 100))

    const second = withTransaction(async (tx) => {
      await tx.query(`SELECT * FROM ${SCRATCH_TABLE} WHERE label = 'locked-row' FOR UPDATE`)
      events.push('second:locked')
      await tx.query(`UPDATE ${SCRATCH_TABLE} SET n = n + 1 WHERE label = 'locked-row'`)
    })

    await Promise.all([first, second])

    assert.deepStrictEqual(
      events,
      ['first:locked', 'first:committing', 'second:locked'],
      'second transaction must not acquire the row lock until the first commits'
    )

    const row = await queryRow(`SELECT n FROM ${SCRATCH_TABLE} WHERE label = 'locked-row'`)
    assert.strictEqual(row?.n, 2, 'both increments must apply (no lost update)')
  })

  it('releases the connection on success and on failure (pool returns to idle)', async () => {
    const baseline = getPoolStats()

    await withTransaction(async (tx) => { await tx.query('SELECT 1') })
    await assert.rejects(withTransaction(async () => { throw new Error('fail') }), /fail/)

    // Run more transactions than the pool max — if connections leaked, this hangs.
    for (let i = 0; i < 25; i++) {
      await withTransaction(async (tx) => { await tx.query('SELECT 1') })
    }

    const after = getPoolStats()
    assert.strictEqual(after.waiting, 0, 'no waiters left behind')
    assert.ok(after.total <= 20, 'pool never exceeds max')
    assert.strictEqual(after.idle, after.total, 'all connections returned to idle')
    assert.ok(baseline.total <= after.total, 'sanity: pool grew or stayed the same')
  })

  it('rejects nested withTransaction (no savepoint support)', async () => {
    await assert.rejects(
      withTransaction(async () => {
        await withTransaction(async (tx) => { await tx.query('SELECT 1') })
      }),
      /Nested withTransaction is not supported/
    )
  })
})

describe('withAdvisoryLock', { skip: !dbAvailable }, () => {
  it('runs the callback and returns its result when uncontended', async () => {
    const result = await withAdvisoryLock('db-test-lock-uncontended', async () => 'ran')
    assert.strictEqual(result, 'ran')
  })

  it('returns null (does not run fn) when the lock is held elsewhere', async () => {
    let innerRan = false
    const outer = await withAdvisoryLock('db-test-lock-contended', async () => {
      const inner = await withAdvisoryLock('db-test-lock-contended', async () => {
        innerRan = true
        return 'inner'
      })
      assert.strictEqual(inner, null, 'contended try-lock must return null')
      return 'outer'
    })
    assert.strictEqual(outer, 'outer')
    assert.strictEqual(innerRan, false)
  })

  it('releases the lock after the callback completes', async () => {
    await withAdvisoryLock('db-test-lock-release', async () => 'first')
    const again = await withAdvisoryLock('db-test-lock-release', async () => 'second')
    assert.strictEqual(again, 'second')
  })

  it('releases the lock even when the callback throws', async () => {
    await assert.rejects(
      withAdvisoryLock('db-test-lock-throw', async () => { throw new Error('callback boom') }),
      /callback boom/
    )
    const after = await withAdvisoryLock('db-test-lock-throw', async () => 'reacquired')
    assert.strictEqual(after, 'reacquired')
  })

  after(async () => {
    await closePool()
  })
})
