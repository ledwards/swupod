#!/usr/bin/env npx tsx
// @ts-nocheck
// Make a user an admin by email or Discord ID
// Usage:
//   npx tsx scripts/makeAdmin.ts user@email.com
//   npx tsx scripts/makeAdmin.ts --discord 123456789

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

async function makeAdmin(identifier: string, isDiscordId: boolean = false): Promise<void> {
  try {
    // auth_version bump invalidates the user's existing tokens at the
    // privileged gates immediately (they re-auth via /api/auth/refresh),
    // instead of stale 30-day tokens coexisting with the new privileges.
    const query = isDiscordId
      ? 'UPDATE users SET is_admin = TRUE, auth_version = auth_version + 1 WHERE discord_id = $1 RETURNING id, email, username, discord_id, is_admin, auth_version'
      : 'UPDATE users SET is_admin = TRUE, auth_version = auth_version + 1 WHERE email = $1 RETURNING id, email, username, discord_id, is_admin, auth_version'

    const result = await pool.query(query, [identifier])

    if (result.rows.length === 0) {
      console.error(`Error: User not found with ${isDiscordId ? 'Discord ID' : 'email'}: ${identifier}`)
      process.exit(1)
    }

    const user = result.rows[0]
    console.log('Successfully granted admin access:')
    console.log(`  ID: ${user.id}`)
    console.log(`  Email: ${user.email || '(none)'}`)
    console.log(`  Username: ${user.username || '(none)'}`)
    console.log(`  Discord ID: ${user.discord_id || '(none)'}`)
    console.log(`  is_admin: ${user.is_admin}`)
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
  console.log('  npx tsx scripts/makeAdmin.ts user@email.com')
  console.log('  npx tsx scripts/makeAdmin.ts --discord 123456789')
  process.exit(1)
}

if (args[0] === '--discord') {
  if (!args[1]) {
    console.error('Error: Discord ID required after --discord flag')
    process.exit(1)
  }
  makeAdmin(args[1], true)
} else {
  makeAdmin(args[0], false)
}
