// @ts-nocheck
// Database migration script with environment support
// Usage:
//   npm run migrate:dev   - Migrate development database
//   npm run migrate:prod  - Migrate production database (with confirmation)
//   npm run migrate:status - Show migration status

import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'
import dotenv from 'dotenv'
import readline from 'readline'
import { requiresNoTransaction, splitSqlStatements } from '../lib/migrationSql'

const { Client } = pg

/*
 * Load .env.local BEFORE .env, and never with `override`.
 *
 * dotenv does not replace a key that is already set, so first-loaded wins and the
 * resulting precedence is exactly the one we want:
 *
 *   1. a real environment variable  — what `railway run -e production` injects
 *   2. .env.local                   — the developer's local overrides
 *   3. .env                         — the shared defaults
 *
 * This used to be a bare `dotenv.config()`, which reads .env only. In a worktree
 * whose .env carries the production POSTGRES_URL and whose .env.local points at
 * localhost — the normal setup here, and what every other script in this repo
 * reads — `npm run migrate:dev` resolved to PRODUCTION. The guard below caught it
 * and demanded confirmation, but the command should never have aimed there.
 *
 * `override: true` would be wrong: it would let a local .env.local outrank the
 * connection string Railway injects, so a real production migration would silently
 * retarget localhost. Order, not override.
 */
dotenv.config({ path: './.env.local' })
dotenv.config({ path: './.env' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Argument parsing is deliberately strict and fails closed.
//
// It used to be neither. `npx tsx scripts/migrate.ts status` put "status" where
// the ENVIRONMENT is read, so it became an unrecognised env that silently
// disabled the production confirmation; the command was read from argv[3] and
// so defaulted to "migrate". A command that reads like a status check migrated
// production without asking. That happened on 2026-08-23.
//
// Two invariants now hold:
//   1. The environment must be exactly "dev" or "prod". Anything else exits.
//   2. Whether we confirm is decided by the DATABASE WE ARE ABOUT TO WRITE TO,
//      not by the label the caller typed — `env` does not choose a database,
//      POSTGRES_URL does (see getDatabaseUrl), so the label was never a safe
//      guard on its own.
const VALID_ENVS = ['dev', 'prod'] as const
const VALID_COMMANDS = ['migrate', 'status'] as const

const args = process.argv.slice(2)
const positional = args.filter(a => !a.startsWith('-'))
const [rawEnv = 'dev', rawCommand = 'migrate', ...extraPositional] = positional

if (!VALID_ENVS.includes(rawEnv as (typeof VALID_ENVS)[number])) {
  console.error(`❌ Unknown environment "${rawEnv}".`)
  console.error(`   Expected one of: ${VALID_ENVS.join(', ')}`)
  console.error('   Usage: tsx scripts/migrate.ts <dev|prod> [migrate|status] [--yes]')
  console.error('   (Refusing to guess — an unrecognised environment used to skip the')
  console.error('    production confirmation and migrate whatever POSTGRES_URL pointed at.)')
  process.exit(1)
}

if (!VALID_COMMANDS.includes(rawCommand as (typeof VALID_COMMANDS)[number])) {
  console.error(`❌ Unknown command "${rawCommand}".`)
  console.error(`   Expected one of: ${VALID_COMMANDS.join(', ')}`)
  process.exit(1)
}

if (extraPositional.length > 0) {
  console.error(`❌ Unexpected argument(s): ${extraPositional.join(', ')}`)
  console.error('   Usage: tsx scripts/migrate.ts <dev|prod> [migrate|status] [--yes]')
  process.exit(1)
}

const env = rawEnv
const declaredProd = env === 'prod'
const skipConfirm = args.includes('--yes') || args.includes('-y') || process.env.CI === 'true'

interface MigrationFile {
  name: string
  path: string
  type: 'sql' | 'js'
}

interface MigrationRow {
  migration_name: string
  applied_at: string
}

// Get database URL based on environment
/**
 * Whether a connection string points at something that is not a local database.
 *
 * This is the real guard. `env` is only a label the caller typed — it does not
 * select a database, POSTGRES_URL does. So we decide "is this production?" from
 * the host we are actually about to write to.
 */
function looksLikeRemoteDatabase(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname.toLowerCase()
    return !(host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local'))
  } catch {
    // Unparseable: assume the riskier answer.
    return true
  }
}

function getDatabaseUrl(): string {
  const dbUrl = process.env.POSTGRES_URL
  if (!dbUrl) {
    console.error('❌ Error: POSTGRES_URL is not set in environment variables')
    console.error('   Set it in your .env file or as an environment variable')
    if (declaredProd) {
      console.error('   For production migrations, ensure POSTGRES_URL points to production database')
    } else {
      console.error('   For development migrations, ensure POSTGRES_URL points to development database')
    }
    process.exit(1)
  }
  return dbUrl
}

// Create database client with custom connection string
function createDbClient(connectionString: string): pg.Client {
  // Normalize SSL mode to avoid deprecation warnings
  // Replace 'prefer', 'require', 'verify-ca' with 'verify-full' explicitly
  let normalizedConnectionString = connectionString

  // Check if connection string has sslmode parameter
  if (normalizedConnectionString.includes('sslmode=')) {
    // Replace deprecated SSL modes with verify-full
    normalizedConnectionString = normalizedConnectionString
      .replace(/sslmode=prefer/gi, 'sslmode=verify-full')
      .replace(/sslmode=require/gi, 'sslmode=verify-full')
      .replace(/sslmode=verify-ca/gi, 'sslmode=verify-full')
  } else {
    // For Neon and other cloud databases, add explicit SSL mode
    const isCloudDB = normalizedConnectionString.includes('.neon.tech') ||
                      normalizedConnectionString.includes('.supabase.co') ||
                      normalizedConnectionString.includes('.aws.neon.tech')

    if (isCloudDB) {
      // Add sslmode=verify-full to connection string
      const separator = normalizedConnectionString.includes('?') ? '&' : '?'
      normalizedConnectionString = `${normalizedConnectionString}${separator}sslmode=verify-full`
    }
  }

  // Determine if SSL is needed
  const requiresSSL = normalizedConnectionString.includes('sslmode=verify-full') ||
                      normalizedConnectionString.includes('sslmode=require') ||
                      normalizedConnectionString.includes('ssl=true')

  return new Client({
    connectionString: normalizedConnectionString,
    ssl: requiresSSL ? { rejectUnauthorized: true } : false
  })
}

// Get all migration files sorted by name (supports .sql and .js)
function getMigrationFiles(): MigrationFile[] {
  const migrationsDir = join(__dirname, '../migrations')
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') || file.endsWith('.js'))
    .filter(file => file !== '000_migration_tracking.sql') // Exclude tracking table migration
    .sort()

  return files.map(file => ({
    name: file,
    path: join(migrationsDir, file),
    type: file.endsWith('.js') ? 'js' : 'sql'
  }))
}

// Check if migration has been applied
async function isMigrationApplied(client: pg.Client, migrationName: string): Promise<boolean> {
  try {
    const result = await client.query(
      'SELECT 1 FROM migrations WHERE migration_name = $1',
      [migrationName]
    )
    return result.rows.length > 0
  } catch (error: any) {
    // If migrations table doesn't exist, return false
    if (error.message && (error.message.includes('does not exist') || error.message.includes('relation "migrations"'))) {
      return false
    }
    throw error
  }
}

// Mark migration as applied
async function markMigrationApplied(client: pg.Client, migrationName: string): Promise<void> {
  await client.query(
    'INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
    [migrationName]
  )
}

// Run a single migration (SQL or JS)
async function runMigration(client: pg.Client, migrationFile: MigrationFile): Promise<boolean> {
  const migrationName = migrationFile.name
  const migrationPath = migrationFile.path
  const migrationType = migrationFile.type

  // Check if already applied
  const isApplied = await isMigrationApplied(client, migrationName)
  if (isApplied) {
    console.log(`⏭️  Skipping ${migrationName} (already applied)`)
    return false
  }

  console.log(`📦 Running ${migrationName}...`)

  if (migrationType === 'js') {
    // Import and run JS migration
    const migration = await import(migrationPath)
    if (typeof migration.run !== 'function') {
      throw new Error(`JS migration ${migrationName} must export a 'run' function`)
    }
    await migration.run(client)
  } else {
    // Read and execute SQL migration
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    if (requiresNoTransaction(migrationSQL)) {
      // CREATE INDEX CONCURRENTLY etc. cannot run inside a transaction
      // block; a multi-statement simple query IS one implicit transaction.
      // Run statement-by-statement instead (see lib/migrationSql.ts).
      console.log(`   (non-transactional migration: running ${migrationName} statement-by-statement)`)
      for (const statement of splitSqlStatements(migrationSQL)) {
        await client.query(statement)
      }
    } else {
      await client.query(migrationSQL)
    }
  }

  // Mark as applied
  await markMigrationApplied(client, migrationName)

  console.log(`✅ Applied ${migrationName}`)
  return true
}

// Ensure migration tracking table exists
async function ensureMigrationTable(client: pg.Client): Promise<void> {
  const trackingMigrationPath = join(__dirname, '../migrations/000_migration_tracking.sql')
  const trackingSQL = readFileSync(trackingMigrationPath, 'utf-8')

  try {
    await client.query(trackingSQL)
  } catch (error: any) {
    // Table might already exist, that's okay
    if (!error.message.includes('already exists')) {
      throw error
    }
  }
}

// Confirm production migration
function confirmProductionMigration(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    rl.question('\n⚠️  WARNING: You are about to migrate the PRODUCTION database.\n   Are you sure? Type "yes" to continue: ', (answer) => {
      rl.close()
      if (answer.toLowerCase() === 'yes') {
        resolve(true)
      } else {
        console.log('❌ Migration cancelled')
        resolve(false)
      }
    })
  })
}

// Show migration status
async function showStatus(client: pg.Client, envName: string): Promise<void> {
  // Report the host, not the label the caller typed. `migrate.ts prod status` with a
  // local POSTGRES_URL used to print "Migration Status for PROD database" while
  // reading localhost, which is the same lie the refusal above exists to prevent —
  // just quieter, because status never reaches that check.
  const host = (() => {
    try {
      return new URL(getDatabaseUrl()).hostname
    } catch {
      return 'unknown host'
    }
  })()
  console.log(`\n📊 Migration Status for ${envName.toUpperCase()} database (${host}):`)
  console.log('─'.repeat(50))

  try {
    await client.connect()
    const result = await client.query(
      'SELECT migration_name, applied_at FROM migrations ORDER BY applied_at'
    )

    if (result.rows.length === 0) {
      console.log('   No migrations have been applied yet.')
    } else {
      result.rows.forEach((row: MigrationRow) => {
        const date = new Date(row.applied_at).toLocaleString()
        console.log(`   ✅ ${row.migration_name} - Applied: ${date}`)
      })
    }

    const allMigrations = getMigrationFiles()
    const appliedMigrations = result.rows.map((r: MigrationRow) => r.migration_name)
    const pendingMigrations = allMigrations.filter(m => !appliedMigrations.includes(m.name))

    if (pendingMigrations.length > 0) {
      console.log('\n   Pending migrations:')
      pendingMigrations.forEach(m => {
        console.log(`   ⏳ ${m.name}`)
      })
    } else {
      console.log('\n   ✅ All migrations are up to date!')
    }

    await client.end()
  } catch (error: any) {
    if (error.message && (error.message.includes('does not exist') || error.message.includes('relation "migrations"'))) {
      console.log('   ⚠️  Migration tracking table does not exist yet.')
      console.log('   Run a migration to create it.')
    } else {
      throw error
    }
  } finally {
    if (client && typeof client.end === 'function') {
      try {
        await client.end()
      } catch (e) {
        // Ignore errors on close
      }
    }
  }
}

// Main migration function
async function runMigrations(): Promise<void> {
  // Use the validated command from the top of the file. Reading argv[3]
  // directly is what made `migrate.ts status` fall through to "migrate".
  const command = rawCommand
  let client: pg.Client | null = null

  if (command === 'status') {
    // Show status for current environment
    const dbUrl = getDatabaseUrl()
    client = createDbClient(dbUrl)
    await showStatus(client, env)
    process.exit(0)
  }

  // For production, require confirmation (unless --yes flag or CI environment)
  // Confirm when EITHER the caller said prod or the connection string points
  // somewhere remote. The second half is what stops a mislabelled invocation
  // from writing to production unchallenged.
  const targetIsRemote = looksLikeRemoteDatabase(getDatabaseUrl())
  const isProd = declaredProd || targetIsRemote

  if (declaredProd !== targetIsRemote) {
    console.warn(`\n⚠️  Environment says "${env}" but POSTGRES_URL points at a ${targetIsRemote ? 'REMOTE' : 'LOCAL'} host.`)
    console.warn('   Trusting the connection string, not the label.')
  }

  /*
   * "prod" against a local database is a contradiction, not a preference.
   *
   * The other mismatch — "dev" against a remote host — is merely surprising, and
   * the confirmation prompt is an adequate answer to it. This one is worse: the
   * prompt says "You are about to migrate the PRODUCTION database", the operator
   * types yes because that is what they intended, and localhost gets migrated
   * while production is untouched. A prompt cannot fix a lie. Refuse instead.
   */
  if (declaredProd && !targetIsRemote) {
    console.error('\n❌ Refusing to run: you asked for "prod" but POSTGRES_URL is local.')
    console.error('   Confirming here would migrate localhost while production stayed behind.')
    console.error('   For a real production migration, let Railway supply the connection string:')
    console.error('     railway run -e production npm run migrate:prod')
    process.exit(1)
  }

  if (isProd && !skipConfirm) {
    const confirmed = await confirmProductionMigration()
    if (!confirmed) {
      process.exit(0)
    }
  }

  try {
    const dbUrl = getDatabaseUrl()
    console.log(`\n🔧 Connecting to ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} database...`)
    console.log(`   Host: ${(() => { try { return new URL(getDatabaseUrl()).hostname } catch { return 'unparseable' } })()}`)
    console.log(`   Environment: ${env}`)

    client = createDbClient(dbUrl)

    // Connect to database
    await client.connect()
    console.log('✅ Connected to database\n')

    // Ensure migration tracking table exists
    await ensureMigrationTable(client)

    // Get all migration files
    const migrationFiles = getMigrationFiles()

    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found')
      process.exit(0)
    }

    console.log(`📋 Found ${migrationFiles.length} migration file(s)\n`)

    // Run migrations
    let appliedCount = 0
    for (const migrationFile of migrationFiles) {
      const applied = await runMigration(client, migrationFile)
      if (applied) {
        appliedCount++
      }
    }

    if (appliedCount === 0) {
      console.log('\n✅ All migrations are already applied!')
    } else {
      console.log(`\n✅ Migration completed! Applied ${appliedCount} migration(s)`)
    }

    await client.end()
    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  } finally {
    // Ensure client is closed
    if (client && typeof client.end === 'function') {
      try {
        await client.end()
      } catch (e) {
        // Ignore errors on close
      }
    }
  }
}

// Run migrations
runMigrations()
