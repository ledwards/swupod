// @ts-nocheck
// Orchestrates database migrations at Railway deploy time.
//
// Each migration runs in its own child process with a generous heap
// (--max-old-space-size=4096) so that an OOM, SIGSEGV, or SQL error in
// any one migration CANNOT block the migrations that come after it.
//
// Usage: npx tsx scripts/migrate-on-deploy.ts
// Required env: POSTGRES_URL

import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import pg from 'pg'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface MigrationFile {
  name: string
  path: string
  type: 'sql' | 'js'
}

function getDatabaseUrl(): string {
  const dbUrl = process.env.POSTGRES_URL
  if (!dbUrl) {
    console.error('❌ POSTGRES_URL is not set')
    process.exit(1)
  }
  return dbUrl
}

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

function getMigrationFiles(): MigrationFile[] {
  const migrationsDir = join(__dirname, '../migrations')
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
    .filter(f => f !== '000_migration_tracking.sql')
    .sort()
  return files.map(f => ({
    name: f,
    path: join(migrationsDir, f),
    type: f.endsWith('.js') ? 'js' : 'sql'
  }))
}

async function ensureMigrationTable(client: pg.Client): Promise<void> {
  const trackingPath = join(__dirname, '../migrations/000_migration_tracking.sql')
  const sql = readFileSync(trackingPath, 'utf-8')
  try {
    await client.query(sql)
  } catch (err: any) {
    if (!err.message?.includes('already exists')) throw err
  }
}

async function getAppliedSet(client: pg.Client): Promise<Set<string>> {
  const result = await client.query('SELECT migration_name FROM migrations')
  return new Set(result.rows.map((r: any) => r.migration_name))
}

// Spawn one migration as a child process. Resolves to exit code
// (0 = success, anything else = failure). Never throws — failures
// are reported via the exit code so the caller can continue.
function runMigrationChild(migrationName: string, dbUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const runnerPath = join(__dirname, 'run-single-migration.ts')
    const child = spawn('npx', ['tsx', runnerPath, migrationName], {
      env: {
        ...process.env,
        POSTGRES_URL: dbUrl,
        // Give each migration a generous heap. Railway containers have
        // plenty of RAM; the default 1.5GB heap is what triggers OOMs
        // when processing large JSON columns.
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim()
      },
      stdio: 'inherit'
    })
    child.on('close', (code, signal) => {
      if (signal) {
        console.log(`   (child killed by signal ${signal})`)
        resolve(code ?? 1)
      } else {
        resolve(code ?? 1)
      }
    })
    child.on('error', (err) => {
      console.error(`   Child spawn error:`, err.message)
      resolve(1)
    })
  })
}

async function main(): Promise<void> {
  const dbUrl = getDatabaseUrl()
  const isProduction = process.env.RAILWAY_ENVIRONMENT === 'production'

  console.log(`\n🔧 Running migrations for ${isProduction ? 'PRODUCTION' : 'PREVIEW/DEV'} environment...`)

  const client = createDbClient(dbUrl)
  await client.connect()
  console.log('✅ Connected to database\n')

  await ensureMigrationTable(client)
  const applied = await getAppliedSet(client)
  const migrationFiles = getMigrationFiles()

  if (migrationFiles.length === 0) {
    console.log('⚠️  No migration files found')
    await client.end()
    process.exit(0)
  }

  const pending = migrationFiles.filter(m => !applied.has(m.name))
  console.log(`📋 ${migrationFiles.length} migration file(s), ${pending.length} pending\n`)

  if (pending.length === 0) {
    console.log('✅ All migrations are already applied!')
    await client.end()
    process.exit(0)
  }

  // Close the orchestrator's DB connection before spawning children so
  // we don't hold an idle connection during potentially long migrations.
  await client.end()

  let okCount = 0
  const failures: string[] = []

  for (const m of pending) {
    console.log(`📦 Running ${m.name} (child process, 4GB heap)...`)
    const code = await runMigrationChild(m.name, dbUrl)
    if (code === 0) {
      console.log(`✅ Applied ${m.name}\n`)
      okCount++
    } else {
      console.log(`⚠️  ${m.name} exited with code ${code} — continuing with next migration\n`)
      failures.push(m.name)
    }
  }

  console.log('\n────────────────────────────────────────')
  console.log(`✅ Applied: ${okCount}`)
  if (failures.length > 0) {
    console.log(`⚠️  Failed:  ${failures.length}`)
    for (const f of failures) console.log(`     - ${f}`)
    console.log('\nFailed migrations are isolated — they did not block others.')
    console.log('Investigate and redeploy; only the failed migrations will re-run.')
  }
  console.log('────────────────────────────────────────\n')

  // Always exit 0 so the server can start. Individual failures are logged
  // above but must not block the app from booting.
  process.exit(0)
}

if (process.env.POSTGRES_URL) {
  const dbUrl = process.env.POSTGRES_URL
  const isRailwayInternal = dbUrl.includes('.railway.internal')
  const isRuntime = process.env.RAILWAY_RUNTIME === 'true' || process.env.npm_lifecycle_event !== 'build'

  if (isRailwayInternal && !isRuntime && process.argv[1]?.includes('migrate-on-deploy')) {
    console.log('⚠️  Railway internal database URL detected during build.')
    console.log('   Skipping migrations during build — they will run at server startup.')
    process.exit(0)
  }

  main().catch(err => {
    console.error('❌ Orchestrator failed:', err.message || err)
    if (err.stack) console.error(err.stack)
    // Even orchestrator-level failures should not block the app from booting.
    process.exit(0)
  })
} else {
  console.log('⚠️  POSTGRES_URL not set. Skipping migrations (normal for local dev).')
  process.exit(0)
}
