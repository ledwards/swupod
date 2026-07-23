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

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get environment from command line argument
const args = process.argv.slice(2)
const env = args.find(a => !a.startsWith('--')) || 'dev'
const isProd = env === 'prod'
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
function getDatabaseUrl(): string {
  const dbUrl = process.env.POSTGRES_URL
  if (!dbUrl) {
    console.error('❌ Error: POSTGRES_URL is not set in environment variables')
    console.error('   Set it in your .env file or as an environment variable')
    if (isProd) {
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
  console.log(`\n📊 Migration Status for ${envName.toUpperCase()} database:`)
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
  const command = process.argv[3] || 'migrate'
  let client: pg.Client | null = null

  if (command === 'status') {
    // Show status for current environment
    const dbUrl = getDatabaseUrl()
    client = createDbClient(dbUrl)
    await showStatus(client, env)
    process.exit(0)
  }

  // For production, require confirmation (unless --yes flag or CI environment)
  if (isProd && !skipConfirm) {
    const confirmed = await confirmProductionMigration()
    if (!confirmed) {
      process.exit(0)
    }
  }

  try {
    const dbUrl = getDatabaseUrl()
    console.log(`\n🔧 Connecting to ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} database...`)
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
