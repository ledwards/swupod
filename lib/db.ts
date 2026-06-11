// Database client - supports both Vercel Postgres and standard DATABASE_URL
import pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'

const { Pool } = pg

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[]
  rowCount: number | null
  command: string
  fields: pg.FieldDef[]
}

// Create a connection pool
// Railway provides DATABASE_URL, Vercel provides POSTGRES_URL
const connectionString = process.env['DATABASE_URL'] || process.env['POSTGRES_URL']

if (!connectionString) {
  console.warn('No database connection string found (DATABASE_URL or POSTGRES_URL)')
}

const pool = connectionString ? new Pool({
  connectionString,
  ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  max: 20, // Support more concurrent connections for 8-player drafts
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
}) : null

/**
 * Execute a SQL query
 * @param queryText - SQL query string
 * @param params - Query parameters
 * @returns Query result
 */
export async function query(queryText: string, params: unknown[] = []): Promise<QueryResult> {
  if (!pool) {
    throw new Error('Database not configured')
  }
  try {
    const result = await pool.query(queryText, params)
    return result as QueryResult
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

/**
 * Execute a SQL query and return rows
 * @param queryText - SQL query string
 * @param params - Query parameters
 * @returns Query rows
 */
export async function queryRows(queryText: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const result = await query(queryText, params)
  return result.rows || []
}

/**
 * Execute a SQL query and return first row
 * @param queryText - SQL query string
 * @param params - Query parameters
 * @returns First row or null
 */
export async function queryRow(queryText: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const rows = await queryRows(queryText, params)
  return rows[0] || null
}

/**
 * Query interface scoped to a single checked-out client inside a transaction.
 * Same signatures as the module-level query/queryRow/queryRows so transactional
 * code reads identically to non-transactional code.
 */
export interface TxClient {
  query(queryText: string, params?: unknown[]): Promise<QueryResult>
  queryRows(queryText: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  queryRow(queryText: string, params?: unknown[]): Promise<Record<string, unknown> | null>
}

// Tracks whether the current async context is already inside a transaction.
// Nesting is rejected (no savepoint support) — a nested withTransaction would
// silently check out a SECOND pool connection and run outside the outer
// transaction, which is a deadlock + atomicity hazard.
const txContext = new AsyncLocalStorage<boolean>()

/**
 * Run `fn` inside a single BEGIN/COMMIT transaction on one pooled connection.
 *
 * - COMMIT on success, ROLLBACK + rethrow on error.
 * - The connection is always released; if ROLLBACK itself fails the connection
 *   is released with the error so the pool discards it instead of reusing a
 *   connection in an unknown transaction state.
 * - Nested calls throw — single-level only (no savepoints).
 *
 * @param fn - Callback receiving a TxClient whose queries all run on the
 *             transaction's connection.
 * @returns The callback's return value.
 */
export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error('Database not configured')
  }
  if (txContext.getStore()) {
    throw new Error('Nested withTransaction is not supported (no savepoint support) — pass the outer tx instead')
  }

  const client = await pool.connect()
  let releasedWithError = false

  const tx: TxClient = {
    async query(queryText: string, params: unknown[] = []): Promise<QueryResult> {
      try {
        const result = await client.query(queryText, params)
        return result as QueryResult
      } catch (error) {
        console.error('Database query error (in transaction):', error)
        throw error
      }
    },
    async queryRows(queryText: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
      const result = await tx.query(queryText, params)
      return result.rows || []
    },
    async queryRow(queryText: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
      const rows = await tx.queryRows(queryText, params)
      return rows[0] || null
    },
  }

  try {
    return await txContext.run(true, async () => {
      await client.query('BEGIN')
      try {
        const result = await fn(tx)
        await client.query('COMMIT')
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          console.error('Database ROLLBACK failed, discarding connection:', rollbackError)
          releasedWithError = true
          client.release(rollbackError as Error)
        }
        throw error
      }
    })
  } finally {
    if (!releasedWithError) {
      client.release()
    }
  }
}

/**
 * Run `fn` while holding a session-level advisory lock derived from `key`,
 * on a dedicated connection. If the lock is already held elsewhere, `fn` is
 * NOT run and `null` is returned (try-lock semantics — no waiting).
 *
 * The lock auto-releases if the process crashes (session drop), so there is
 * no stale-lock expiry to tune. `fn` runs with ordinary pool queries — the
 * lock connection is only used to hold the lock.
 *
 * @param key - String lock key (hashed via hashtext into the advisory-lock space)
 * @param fn - Callback to run while the lock is held
 * @returns The callback's return value, or null if the lock was not acquired
 */
export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  if (!pool) {
    throw new Error('Database not configured')
  }

  const client = await pool.connect()
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [key])
    if (!result.rows[0]?.acquired) {
      return null
    }
    try {
      return await fn()
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key])
    }
  } finally {
    client.release()
  }
}

/**
 * Pool statistics for tests and diagnostics.
 */
export function getPoolStats(): { total: number; idle: number; waiting: number } {
  if (!pool) {
    return { total: 0, idle: 0, waiting: 0 }
  }
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
}

/**
 * Close the pool (tests / graceful shutdown).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
  }
}

/**
 * Test database connection
 * @returns True if connected
 */
export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT 1')
    return true
  } catch (error) {
    console.error('Database connection test failed:', error)
    return false
  }
}
