// @ts-nocheck
// Runs ONE migration file in an isolated process.
// Called as a child process by migrate-on-deploy.ts so that a crash
// (OOM, SIGSEGV, SQL error) in one migration cannot block other migrations.
//
// Usage: npx tsx scripts/run-single-migration.ts <migration-filename>
// Required env: POSTGRES_URL

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'
import { requiresNoTransaction, splitSqlStatements } from '../lib/migrationSql'

const { Client } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createDbClient(connectionString: string): pg.Client {
  let normalized = connectionString
  if (normalized.includes('sslmode=')) {
    normalized = normalized
      .replace(/sslmode=prefer/gi, 'sslmode=verify-full')
      .replace(/sslmode=require/gi, 'sslmode=verify-full')
      .replace(/sslmode=verify-ca/gi, 'sslmode=verify-full')
  } else {
    const isCloudDB = normalized.includes('.neon.tech') ||
                      normalized.includes('.supabase.co') ||
                      normalized.includes('.aws.neon.tech')
    if (isCloudDB) {
      const sep = normalized.includes('?') ? '&' : '?'
      normalized = `${normalized}${sep}sslmode=verify-full`
    }
  }
  const requiresSSL = normalized.includes('sslmode=verify-full') ||
                      normalized.includes('sslmode=require') ||
                      normalized.includes('ssl=true')
  return new Client({
    connectionString: normalized,
    ssl: requiresSSL ? { rejectUnauthorized: true } : false
  })
}

async function main(): Promise<void> {
  const migrationName = process.argv[2]
  if (!migrationName) {
    console.error('❌ Usage: run-single-migration.ts <migration-filename>')
    process.exit(2)
  }

  const dbUrl = process.env.POSTGRES_URL
  if (!dbUrl) {
    console.error('❌ POSTGRES_URL is not set')
    process.exit(2)
  }

  const migrationPath = join(__dirname, '../migrations', migrationName)
  const type: 'sql' | 'js' = migrationName.endsWith('.js') ? 'js' : 'sql'

  const client = createDbClient(dbUrl)
  await client.connect()

  try {
    if (type === 'js') {
      const mod = await import(migrationPath)
      if (typeof mod.run !== 'function') {
        throw new Error(`JS migration ${migrationName} must export a 'run' function`)
      }
      await mod.run(client)
    } else {
      const sql = readFileSync(migrationPath, 'utf-8')
      if (requiresNoTransaction(sql)) {
        // Statements like CREATE INDEX CONCURRENTLY cannot run inside a
        // transaction block — and pg's simple query protocol wraps a
        // multi-statement string in one implicit transaction. Run these
        // files statement-by-statement (each statement is its own implicit
        // single-statement transaction). The splitter is comment/literal
        // aware, so semicolons in comments (migration 062) don't break it.
        console.log(`   (non-transactional migration: running ${migrationName} statement-by-statement)`)
        for (const statement of splitSqlStatements(sql)) {
          await client.query(statement)
        }
      } else {
        // Pass the entire file to pg's simple query protocol, which supports
        // multi-statement SQL natively and runs it atomically in one implicit
        // transaction. Do NOT split on ';' blindly — that breaks any
        // statement whose comments or string literals contain a semicolon.
        await client.query(sql)
      }
    }

    // Mark applied only after the migration body finishes without throwing
    await client.query(
      'INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
      [migrationName]
    )

    await client.end()
    process.exit(0)
  } catch (err: any) {
    console.error(`❌ ${migrationName} failed:`, err.message || err)
    if (err.stack) console.error(err.stack)
    try { await client.end() } catch {}
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err)
  process.exit(1)
})
