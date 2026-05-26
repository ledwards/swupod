#!/usr/bin/env npx tsx
// @ts-nocheck
// One-time snapshot of all active Patreon members at the moment the script
// runs. Writes to patreon_pledge_snapshot table (see migrations/062).
//
// Purpose: defensive audit trail for the 2026 price-raise grandfathering.
// If a patron later disputes their charge, we can look up the snapshot row
// for their patron_id / discord_id / email and see the pledge amount they
// were paying when the raise landed.
//
// Idempotent: safe to re-run. ON CONFLICT (patron_id) refreshes the row's
// pledge amount + snapshot timestamp. Run BEFORE U1 effective date for the
// canonical "pre-raise" snapshot. Re-runs after that capture current state
// for ongoing dispute resolution.
//
// Usage:
//   railway run -e production npx tsx scripts/snapshot-patrons.ts
//   railway run -e production npx tsx scripts/snapshot-patrons.ts --dry-run
//
// --dry-run prints what would be inserted/updated without touching the DB.

import 'dotenv/config'
import pg from 'pg'
import { fetchAllPatrons } from '../lib/patreon'

const { Pool } = pg

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('Error: No database connection string found (DATABASE_URL or POSTGRES_URL)')
  process.exit(1)
}

interface SnapshotRow {
  patron_id: string
  discord_id: string | null
  email: string | null
  full_name: string | null
  patron_status: string | null
  pledge_amount_cents: number | null
  pledge_started_at: string | null
}

const ACTIVE_STATUSES = new Set(['active_patron', 'pay_upfront'])

/**
 * Filter raw Patreon members down to the snapshot row set we care about.
 * Pure function — no I/O, no env reads, no side effects. Safe to unit-test.
 *
 * Spec:
 *  - Keep only members whose patron_status is in ACTIVE_STATUSES.
 *  - Map every kept member to a SnapshotRow (1:1).
 *  - Preserve null pledge fields rather than coercing to 0.
 */
export function buildSnapshotRows(members: ReadonlyArray<{
  patreonUserId: string
  fullName: string | null
  email: string | null
  patronStatus: string | null
  discordUserId: string | null
  pledgeAmountCents: number | null
  pledgeStartedAt: string | null
}>): SnapshotRow[] {
  return members
    .filter((m) => ACTIVE_STATUSES.has(m.patronStatus || ''))
    .map((m) => ({
      patron_id: m.patreonUserId,
      discord_id: m.discordUserId,
      email: m.email,
      full_name: m.fullName,
      patron_status: m.patronStatus,
      pledge_amount_cents: m.pledgeAmountCents,
      pledge_started_at: m.pledgeStartedAt,
    }))
}

const UPSERT_SQL = `INSERT INTO patreon_pledge_snapshot
   (patron_id, discord_id, email, full_name, patron_status, pledge_amount_cents, pledge_started_at, snapshot_at)
 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
 ON CONFLICT (patron_id) DO UPDATE SET
   discord_id = EXCLUDED.discord_id,
   email = EXCLUDED.email,
   full_name = EXCLUDED.full_name,
   patron_status = EXCLUDED.patron_status,
   pledge_amount_cents = EXCLUDED.pledge_amount_cents,
   pledge_started_at = EXCLUDED.pledge_started_at,
   snapshot_at = NOW()`

/**
 * Upsert pre-built snapshot rows into the database. Pure with respect to
 * everything except the database — accepts any client with a `query(sql, params)` method.
 */
export async function upsertSnapshotRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  rows: ReadonlyArray<SnapshotRow>,
): Promise<number> {
  let inserted = 0
  for (const row of rows) {
    await client.query(UPSERT_SQL, [
      row.patron_id,
      row.discord_id,
      row.email,
      row.full_name,
      row.patron_status,
      row.pledge_amount_cents,
      row.pledge_started_at,
    ])
    inserted++
  }
  return inserted
}

export async function snapshotPatrons(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  dryRun = false,
): Promise<{ inserted: number; skipped: number; total: number }> {
  console.log(`📥 Fetching members from Patreon...`)
  const members = await fetchAllPatrons()
  console.log(`   Found ${members.length} total members\n`)

  const rows = buildSnapshotRows(members)
  console.log(`📊 Active members (active_patron or pay_upfront): ${rows.length}`)
  console.log(`   Skipping ${members.length - rows.length} non-active (former / declined / etc.)\n`)

  if (dryRun) {
    console.log(`🔎 Dry run — would upsert ${rows.length} rows:`)
    for (const row of rows) {
      const dollars = row.pledge_amount_cents != null ? `$${(row.pledge_amount_cents / 100).toFixed(2)}` : '?'
      console.log(`   ${row.patron_id} | ${row.full_name || '(no name)'} | ${dollars}/mo | started ${row.pledge_started_at || '?'}`)
    }
    return { inserted: 0, skipped: rows.length, total: rows.length }
  }

  console.log(`💾 Upserting ${rows.length} rows into patreon_pledge_snapshot...`)
  const inserted = await upsertSnapshotRows(client, rows)
  console.log(`✅ Upserted ${inserted} rows.`)
  return { inserted, skipped: 0, total: rows.length }
}

export const __test = { UPSERT_SQL, ACTIVE_STATUSES }

// CLI entry: only runs when invoked directly, not when imported by tests.
const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') || connectionString.includes('sslmode=verify')
      ? { rejectUnauthorized: false }
      : false,
  })
  try {
    const result = await snapshotPatrons(pool, isDryRun)
    console.log(`\n🎯 Done. ${result.total} active patrons, ${result.inserted} upserted${isDryRun ? ' (dry run)' : ''}.`)
  } catch (err) {
    console.error('❌ Snapshot failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}
