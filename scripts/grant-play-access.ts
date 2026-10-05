#!/usr/bin/env npx tsx
// Grant beta + Friend of the Pod (patron) flags by username or email.
// AI play and other beta surfaces require is_beta_tester (admins bypass);
// Friend of the Pod is the materialized users.is_patron flag.
// Usage:
//   npx tsx scripts/grant-play-access.ts <username-or-email>   # dev DB via .env
//   POSTGRES_URL=<prod-url> npx tsx scripts/grant-play-access.ts <username-or-email>

import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('Error: No database connection string found (DATABASE_URL or POSTGRES_URL)')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
})

async function grantPlayAccess(identifier: string): Promise<void> {
  try {
    // auth_version bump invalidates the user's existing tokens at the
    // privileged gates immediately (they re-auth via /api/auth/refresh),
    // instead of stale 30-day tokens coexisting with the new privileges.
    const result = await pool.query(
      `UPDATE users SET is_beta_tester = TRUE, is_patron = TRUE, auth_version = auth_version + 1
       WHERE username = $1 OR email = $1
       RETURNING id, email, username, is_beta_tester, is_patron, auth_version`,
      [identifier]
    )

    if (result.rows.length === 0) {
      console.error(`Error: User not found with username or email: ${identifier}`)
      process.exit(1)
    }

    const user = result.rows[0]
    console.log('Successfully granted beta + Friend of the Pod:')
    console.log(`  ID: ${user.id}`)
    console.log(`  Email: ${user.email || '(none)'}`)
    console.log(`  Username: ${user.username || '(none)'}`)
    console.log(`  is_beta_tester: ${user.is_beta_tester}`)
    console.log(`  is_patron: ${user.is_patron}`)
  } catch (error) {
    console.error('Database error:', (error as Error).message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0) {
  console.log('Usage:')
  console.log('  npx tsx scripts/grant-play-access.ts <username-or-email>')
  console.log('  POSTGRES_URL=<prod-url> npx tsx scripts/grant-play-access.ts <username-or-email>')
  process.exit(1)
}

grantPlayAccess(args[0])
