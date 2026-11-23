/**
 * One migration run at a time, across deploys.
 *
 * Railway starts a new deploy's pre-deploy step while an older deploy can still
 * be migrating. Without a lock both read the `migrations` table, both see the same
 * migration as pending, and both run it at once. On 2026-11-23 that happened to
 * migration 122: the second run waited on the first's row locks and would have
 * re-applied its relabel to rows the first had already fixed (it was cancelled by
 * hand).
 *
 * The orchestrator takes a session-level advisory lock before it reads which
 * migrations are applied and holds it until every pending migration has run. A
 * second deploy waits, then reads the `migrations` table fresh and finds nothing
 * left to do. The lock is released when the connection closes, so a crashed
 * runner never leaves it held.
 *
 * The waiter POLLS with pg_try_advisory_lock instead of blocking in
 * pg_advisory_lock. A blocked call is an open statement with a snapshot, and
 * CREATE INDEX CONCURRENTLY (migration 044 and others) waits for every such
 * statement to finish: the holder's index build would wait on the waiter, which
 * waits on the holder. Each poll is a statement that returns at once.
 */

/** Arbitrary, fixed key shared by every migration runner. */
export const MIGRATION_LOCK_KEY = 7212026122

export const MIGRATION_LOCK_POLL_MS = 5000

interface LockClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

interface LockOptions {
  log?: (msg: string) => void
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
}

export async function acquireMigrationLock(client: LockClient, options: LockOptions = {}): Promise<void> {
  const log = options.log ?? console.log
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const pollMs = options.pollMs ?? MIGRATION_LOCK_POLL_MS

  let announced = false
  for (;;) {
    const tried = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_KEY])
    if (tried.rows[0]?.locked === true) {
      if (announced) log('🔓 Migration lock acquired')
      return
    }
    if (!announced) {
      log('⏳ Another deploy is running migrations; waiting for it to finish...')
      announced = true
    }
    await sleep(pollMs)
  }
}
