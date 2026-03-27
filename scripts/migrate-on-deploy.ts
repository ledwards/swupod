// @ts-nocheck
// Migration script for Railway deployments
// This runs automatically during build/deploy
// Usage: npx tsx scripts/migrate-on-deploy.ts

import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface MigrationFile {
  name: string
  path: string
  type: 'sql' | 'js'
}

// Get database URL from environment (Railway provides this)
function getDatabaseUrl(): string {
  const dbUrl = process.env.POSTGRES_URL
  if (!dbUrl) {
    console.error('❌ Error: POSTGRES_URL is not set')
    console.error('   This script should run during Railway deployment where POSTGRES_URL is automatically set')
    process.exit(1)
  }
  return dbUrl
}

// Create database client with SSL support
function createDbClient(connectionString: string): pg.Client {
  let normalizedConnectionString = connectionString

  if (normalizedConnectionString.includes('sslmode=')) {
    normalizedConnectionString = normalizedConnectionString
      .replace(/sslmode=prefer/gi, 'sslmode=verify-full')
      .replace(/sslmode=require/gi, 'sslmode=verify-full')
      .replace(/sslmode=verify-ca/gi, 'sslmode=verify-full')
  } else {
    const isCloudDB = normalizedConnectionString.includes('.neon.tech') ||
                      normalizedConnectionString.includes('.supabase.co') ||
                      normalizedConnectionString.includes('.aws.neon.tech')

    if (isCloudDB) {
      const separator = normalizedConnectionString.includes('?') ? '&' : '?'
      normalizedConnectionString = `${normalizedConnectionString}${separator}sslmode=verify-full`
    }
  }

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
    .filter(file => file !== '000_migration_tracking.sql')
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
    // Read and execute SQL migration - run statements individually so each runs
    // in autocommit mode (required for CREATE INDEX CONCURRENTLY, which cannot
    // run inside a transaction block)
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    for (const statement of statements) {
      await client.query(statement)
    }
  }

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
    if (!error.message.includes('already exists')) {
      throw error
    }
  }
}

// Main migration function
async function runMigrations(): Promise<void> {
  let client: pg.Client | null = null

  try {
    const dbUrl = getDatabaseUrl()
    const isProduction = process.env.RAILWAY_ENVIRONMENT === 'production'

    console.log(`\n🔧 Running migrations for ${isProduction ? 'PRODUCTION' : 'PREVIEW'} environment...`)

    client = createDbClient(dbUrl)
    await client.connect()
    console.log('✅ Connected to database\n')

    await ensureMigrationTable(client)

    const migrationFiles = getMigrationFiles()

    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found')
      process.exit(0)
    }

    console.log(`📋 Found ${migrationFiles.length} migration file(s)\n`)

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
    if (client && typeof client.end === 'function') {
      try {
        await client.end()
      } catch (e) {
        // Ignore errors on close
      }
    }
  }
}

// Only run if POSTGRES_URL is set (i.e., during deployment)
if (process.env.POSTGRES_URL) {
  // Check if this is a Railway internal URL during BUILD time (won't work)
  // But allow it at RUNTIME (when called from server.js)
  const dbUrl = process.env.POSTGRES_URL
  const isRailwayInternal = dbUrl.includes('.railway.internal')
  const isRuntime = process.env.RAILWAY_RUNTIME === 'true' || process.env.npm_lifecycle_event !== 'build'

  if (isRailwayInternal && !isRuntime && process.argv[1]?.includes('migrate-on-deploy')) {
    // This is being called during build with Railway internal URL - skip
    console.log('⚠️  Railway internal database URL detected during build.')
    console.log('   Internal URLs only work at runtime, not during build.')
    console.log('   Skipping migrations during build - they will run at server startup.')
    process.exit(0)
  }
  runMigrations()
} else {
  console.log('⚠️  POSTGRES_URL not set. Skipping migrations (this is normal for local development).')
  console.log('   Migrations will run automatically during deployment.')
  process.exit(0)
}
