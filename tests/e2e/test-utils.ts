// @ts-nocheck
// Test utilities for E2E tests
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables from .env (try multiple locations)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '../..')

// Try loading from various env files
dotenv.config({ path: join(projectRoot, '.env.local') })
dotenv.config({ path: join(projectRoot, '.env') })

// Get the JWT secret from environment or use the same fallback as the app
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'change-me-in-production'
const COOKIE_NAME = 'swupod_session'

// Database connection - lazy initialized and safely reusable
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

let pool: pg.Pool | null = null
let poolEnded = false

export function getPool(): pg.Pool {
  // Fail with the actual cause. Without a connection string pg falls back to
  // its own defaults and dials localhost:5432, so an unconfigured checkout
  // reported dozens of `connect ECONNREFUSED 127.0.0.1:5432` failures spread
  // across every DB-backed spec — one missing variable wearing the costume of
  // a broken suite. Say so once, here, where it can be acted on.
  if (!connectionString) {
    throw new Error(
      'E2E tests need a database: set DATABASE_URL (or POSTGRES_URL), or put it in ' +
      `.env.local / .env in ${projectRoot}. ` +
      'Without it pg silently defaults to localhost:5432 and every DB-backed spec fails.'
    )
  }
  if (poolEnded || !pool) {
    pool = new pg.Pool({ connectionString })
    poolEnded = false
  }
  return pool
}

interface TestUser {
  id: string
  username: string
  email: string
}

interface TestUserResult {
  user: TestUser
  token: string
  cookieName: string
}

/**
 * Create a test user directly in the database
 */
export async function createTestUser(username: string, testId: string, options?: { isBetaTester?: boolean; isAdmin?: boolean; isPatron?: boolean }): Promise<TestUserResult> {
  const uniqueId = `test_${testId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Insert user into database
  const db = getPool()
  const result = await db.query(
    `INSERT INTO users (discord_id, username, email, avatar_url, is_beta_tester, is_admin, is_patron)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uniqueId, username, `${uniqueId}@test.local`, null, options?.isBetaTester || false, options?.isAdmin || false, options?.isPatron || false]
  )

  const user = result.rows[0]

  // Create JWT token (must include is_beta_tester for requireBetaAccess)
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
      is_beta_tester: user.is_beta_tester || false,
      is_admin: user.is_admin || false,
    },
    JWT_SECRET,
    { expiresIn: '1d' }
  )

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    token,
    cookieName: COOKIE_NAME,
  }
}

/**
 * Clean up all test users and their data
 */
export async function cleanupTestUsers(testId: string): Promise<number> {
  const pattern = `test_${testId}_%`
  const db = getPool()

  // Delete in order due to foreign key constraints
  await db.query(
    `DELETE FROM pod_players WHERE user_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
    [pattern]
  )

  await db.query(
    `DELETE FROM pods WHERE host_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
    [pattern]
  )

  await db.query(
    `DELETE FROM card_pools WHERE user_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
    [pattern]
  )

  const result = await db.query(
    'DELETE FROM users WHERE discord_id LIKE $1 RETURNING id',
    [pattern]
  )

  return result.rowCount || 0
}

/**
 * Close database connection (safe to call multiple times)
 */
export async function closeDb(): Promise<void> {
  if (pool && !poolEnded) {
    poolEnded = true
    await pool.end()
    pool = null
  }
}
