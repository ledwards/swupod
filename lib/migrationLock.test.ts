// SPEC: only one migration run at a time. A runner takes the advisory lock
// BEFORE reading which migrations are applied. If another runner holds it, the
// runner says so once and retries a non-blocking try-lock until it gets it; it
// never sits in a blocking pg_advisory_lock call, which would deadlock with
// CREATE INDEX CONCURRENTLY in the holder's migrations.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { acquireMigrationLock, MIGRATION_LOCK_KEY } from './migrationLock'

function fakeClient(results: boolean[]) {
  const calls: { sql: string; params?: unknown[] }[] = []
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params })
      return { rows: [{ locked: results.shift() ?? true }] }
    },
  }
}

describe('acquireMigrationLock', () => {
  it('takes the lock without waiting when it is free', async () => {
    const client = fakeClient([true])
    const logs: string[] = []
    const sleeps: number[] = []
    await acquireMigrationLock(client, { log: m => logs.push(m), sleep: async ms => { sleeps.push(ms) } })
    assert.deepStrictEqual(client.calls, [{ sql: 'SELECT pg_try_advisory_lock($1) AS locked', params: [MIGRATION_LOCK_KEY] }])
    assert.deepStrictEqual(logs, [])
    assert.deepStrictEqual(sleeps, [])
  })

  it('says once that it is waiting, then polls until the holder lets go', async () => {
    const client = fakeClient([false, false, false, true])
    const logs: string[] = []
    const sleeps: number[] = []
    await acquireMigrationLock(client, { log: m => logs.push(m), sleep: async ms => { sleeps.push(ms) }, pollMs: 1234 })
    assert.strictEqual(client.calls.length, 4)
    assert.ok(client.calls.every(c => c.sql === 'SELECT pg_try_advisory_lock($1) AS locked'))
    assert.deepStrictEqual(sleeps, [1234, 1234, 1234])
    assert.strictEqual(logs.length, 2)
    assert.match(logs[0], /waiting/)
    assert.match(logs[1], /acquired/)
  })

  it('never issues a blocking pg_advisory_lock', async () => {
    const client = fakeClient([false, true])
    await acquireMigrationLock(client, { log: () => {}, sleep: async () => {} })
    assert.ok(!client.calls.some(c => /pg_advisory_lock\(/.test(c.sql)))
  })
})
