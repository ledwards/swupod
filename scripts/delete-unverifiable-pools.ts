#!/usr/bin/env npx tsx
// @ts-nocheck
// Delete a user's sealed pools that can never enter table play: pools from
// before table-play verification (no ptp_native_pool_evidence row) plus their
// saved-deck children. Deck snapshots and solo history are left alone (they
// are inert audit rows); pools seated in a live game are refused, never
// force-deleted.
// Usage (dev DB via .env):
//   npx tsx scripts/delete-unverifiable-pools.ts <username-or-email>        # dry run: lists only
//   npx tsx scripts/delete-unverifiable-pools.ts <username-or-email> --yes  # deletes

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

const TREE = `
WITH RECURSIVE dead(id, depth) AS (
  SELECT p.id, 0 FROM card_pools p
  WHERE p.user_id = $1 AND p.pool_type = 'sealed'
    AND (p.parent_pool_id IS NULL OR NOT EXISTS (SELECT 1 FROM card_pools parent WHERE parent.id = p.parent_pool_id))
    AND NOT EXISTS (SELECT 1 FROM ptp_native_pool_evidence e WHERE e.source_pool_id = p.id)
  UNION
  SELECT c.id, d.depth + 1 FROM card_pools c JOIN dead d ON c.parent_pool_id = d.id
)
SELECT id, depth FROM dead`

async function main(identifier: string, execute: boolean): Promise<void> {
  const client = await pool.connect()
  try {
    const user = await client.query('SELECT id, username, email FROM users WHERE username = $1 OR email = $1', [identifier])
    if (user.rows.length === 0) {
      console.error(`Error: User not found with username or email: ${identifier}`)
      process.exit(1)
    }
    const userId = user.rows[0].id
    const trees = await client.query(`${TREE} ORDER BY depth DESC`, [userId])
    if (trees.rows.length === 0) {
      console.log(`No unverifiable sealed pools for ${user.rows[0].username || user.rows[0].email}. Nothing to do.`)
      return
    }
    const ids = trees.rows.map(r => r.id)
    const info = await client.query(
      `SELECT p.id, p.share_id, p.name, p.set_code,
        (SELECT COUNT(*)::int FROM ptp_play_deck_versions v WHERE v.pool_id = p.id) AS versions,
        (SELECT COUNT(*)::int FROM ptp_native_match_seats s JOIN ptp_play_deck_versions v ON v.id = s.deck_version_id WHERE v.pool_id = p.id AND s.released_at IS NULL) AS live_seats,
        (SELECT COUNT(*)::int FROM ptp_solo_ai_runs r WHERE r.pool_share_id = p.share_id) AS solo_runs
       FROM card_pools p WHERE p.id = ANY($1::uuid[])`, [ids])
    const blocked = info.rows.filter(r => r.live_seats > 0)
    const deletable = info.rows.filter(r => r.live_seats === 0)
    for (const row of info.rows) {
      console.log(`- ${row.share_id} ${row.set_code ?? ''} ${row.name ?? ''} (versions:${row.versions} live_seats:${row.live_seats} solo_runs:${row.solo_runs})${row.live_seats > 0 ? ' SKIPPED: seated in a live game' : ''}`)
    }
    if (blocked.length > 0) console.log(`Skipping ${blocked.length} pool(s) seated in a live game. Finish or release those games first.`)
    if (deletable.length === 0) {
      console.log('Nothing deletable.')
      return
    }
    if (!execute) {
      console.log(`Dry run: would delete ${deletable.length} pool(s). Re-run with --yes to delete. Deck snapshots and solo history stay as inert records.`)
      return
    }
    const gone = await client.query('DELETE FROM card_pools WHERE id = ANY($1::uuid[])', [deletable.map(r => r.id)])
    console.log(`Deleted ${gone.rowCount} pool(s). Deck snapshots and solo history were left as inert records.`)
  } finally {
    client.release()
    await pool.end()
  }
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Usage:')
  console.log('  npx tsx scripts/delete-unverifiable-pools.ts <username-or-email> [--yes]')
  process.exit(1)
}
void main(args[0], args.includes('--yes')).catch(error => {
  console.error('Database error:', (error as Error).message)
  process.exit(1)
})
