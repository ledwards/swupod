/**
 * Fresh-database migration guard.
 *
 * Proves that EVERY migration applies from zero: creates a scratch database,
 * runs the real deploy orchestrator (scripts/migrate-on-deploy.ts) against it
 * with production fail-fast semantics, verifies every migration file is
 * marked applied (and that 044's CONCURRENTLY indexes actually exist), then
 * drops the scratch database.
 *
 * Why this exists: migration 044 (CREATE INDEX CONCURRENTLY) could not apply
 * on a fresh database once the runner switched to whole-file simple queries
 * (df1976fd) — pg wraps multi-statement strings in one implicit transaction,
 * which Postgres refuses for CONCURRENTLY. Prod only survived because 044 was
 * applied in the April–May 2026 window when the runner split on ';'. This
 * guard makes "cannot migrate from zero" a failure you see at CI/dev time,
 * not at disaster-recovery time.
 *
 * Usage:   npm run check:migrations-fresh
 * Env:     MIGRATIONS_FRESH_ADMIN_URL — maintenance-DB connection string used
 *          to CREATE/DROP the scratch database
 *          (default: postgresql://localhost:5432/postgres)
 *
 * Requires a reachable local Postgres. Not part of `npm run test` (it spawns
 * ~75 child processes and needs a database); run it whenever migrations or
 * the migration runners change, and in CI with a Postgres service.
 */

import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import pg from 'pg'

const { Client } = pg

const __dirname = dirname(fileURLToPath(import.meta.url))

// The ONLY database this script is allowed to create/drop. Guarded below —
// never point this at a real database.
const SCRATCH_DB = 'swupod_fresh_migrate_test'

const ADMIN_URL =
  process.env.MIGRATIONS_FRESH_ADMIN_URL ||
  'postgresql://localhost:5432/postgres'

function scratchUrl(): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${SCRATCH_DB}`
  return url.toString()
}

function migrationFileCount(): number {
  const migrationsDir = join(__dirname, '../migrations')
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.js'))
    .filter((f) => f !== '000_migration_tracking.sql').length
}

async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: ADMIN_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function dropScratch(client: pg.Client): Promise<void> {
  if (SCRATCH_DB !== 'swupod_fresh_migrate_test') {
    throw new Error(`Refusing to drop unexpected database name: ${SCRATCH_DB}`)
  }
  await client.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`)
}

function runOrchestrator(dbUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const orchestratorPath = join(__dirname, 'migrate-on-deploy.ts')
    const child = spawn('npx', ['tsx', orchestratorPath], {
      env: {
        ...process.env,
        POSTGRES_URL: dbUrl,
        // Production fail-fast semantics (U7): any migration failure must
        // exit non-zero so this guard fails loudly instead of "warn and pass".
        NODE_ENV: 'production',
        ALLOW_STALE_SCHEMA: '',
      },
      stdio: 'inherit',
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', (err) => {
      console.error('❌ Failed to spawn orchestrator:', err.message)
      resolve(1)
    })
  })
}

async function verifySchema(dbUrl: string): Promise<string[]> {
  const problems: string[] = []
  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const expected = migrationFileCount()
    const applied = await client.query('SELECT COUNT(*)::int AS n FROM migrations')
    const appliedCount: number = applied.rows[0].n
    if (appliedCount !== expected) {
      const missing = await client.query('SELECT migration_name FROM migrations')
      const appliedSet = new Set(missing.rows.map((r: { migration_name: string }) => r.migration_name))
      const migrationsDir = join(__dirname, '../migrations')
      const notApplied = readdirSync(migrationsDir)
        .filter((f) => (f.endsWith('.sql') || f.endsWith('.js')) && f !== '000_migration_tracking.sql')
        .filter((f) => !appliedSet.has(f))
      problems.push(
        `applied ${appliedCount}/${expected} migrations; missing: ${notApplied.join(', ') || '(none — extra rows?)'}`
      )
    }

    // 044's indexes are the canonical non-transactional case — assert they
    // really exist (marked-applied alone would not prove the statements ran).
    for (const idx of ['idx_draft_picks_stats', 'idx_pods_complete']) {
      const r = await client.query(
        'SELECT 1 FROM pg_indexes WHERE indexname = $1',
        [idx]
      )
      if (r.rows.length === 0) {
        problems.push(`index ${idx} (migration 044) does not exist`)
      }
    }
  } finally {
    await client.end()
  }
  return problems
}

async function main(): Promise<void> {
  console.log('🧪 Fresh-database migration guard')
  console.log(`   Admin URL:   ${ADMIN_URL}`)
  console.log(`   Scratch DB:  ${SCRATCH_DB}\n`)

  console.log(`🗑️  Dropping stale scratch DB (if any) and creating ${SCRATCH_DB}...`)
  await withAdmin(async (client) => {
    await dropScratch(client)
    await client.query(`CREATE DATABASE ${SCRATCH_DB}`)
  })

  let exitCode = 0
  try {
    console.log('🚀 Running the deploy orchestrator against the fresh database...\n')
    const code = await runOrchestrator(scratchUrl())
    if (code !== 0) {
      console.error(`\n❌ Orchestrator exited with code ${code} — fresh DB cannot migrate from zero.`)
      exitCode = 1
    } else {
      const problems = await verifySchema(scratchUrl())
      if (problems.length > 0) {
        console.error('\n❌ Fresh migration verification failed:')
        for (const p of problems) console.error(`   - ${p}`)
        exitCode = 1
      } else {
        console.log(`\n✅ All ${migrationFileCount()} migrations applied from zero (044 indexes verified).`)
      }
    }
  } finally {
    console.log(`🧹 Dropping ${SCRATCH_DB}...`)
    await withAdmin(dropScratch)
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error('❌ check:migrations-fresh failed:', err.message || err)
  process.exit(1)
})
