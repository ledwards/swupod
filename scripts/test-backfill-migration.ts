#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * Test script for migration 022 (backfill sealed tracking)
 *
 * This script:
 * 1. Starts a local postgres container
 * 2. Runs all migrations to set up schema
 * 3. Inserts test data simulating the bug
 * 4. Runs the backfill migration
 * 5. Verifies the results
 * 6. Cleans up
 *
 * Usage:
 *   npx tsx scripts/test-backfill-migration.ts
 *
 * Requirements:
 *   - Docker must be installed and running
 */

import { execSync, spawn } from 'child_process'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, readdirSync } from 'fs'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const CONTAINER_NAME = 'swupod-test-db'
const TEST_PORT = 5433
const TEST_DB = 'swupod_test'
const TEST_USER = 'postgres'
const TEST_PASSWORD = 'testpass'
const TEST_URL = `postgresql://${TEST_USER}:${TEST_PASSWORD}@localhost:${TEST_PORT}/${TEST_DB}`

// ANSI colors
const colors: Record<string, string> = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

function log(msg: string, color: string = ''): void {
  console.log(`${color}${msg}${colors.reset}`)
}

function logStep(step: number | string, msg: string): void {
  log(`\n[${step}] ${msg}`, colors.cyan)
}

function logSuccess(msg: string): void {
  log(`  ✓ ${msg}`, colors.green)
}

function logError(msg: string): void {
  log(`  ✗ ${msg}`, colors.red)
}

interface TestData {
  userId: string
  poolShareId: string
}

async function startPostgres(): Promise<void> {
  logStep(1, 'Starting test PostgreSQL container...')

  // Stop any existing container
  try {
    execSync(`docker stop ${CONTAINER_NAME} 2>/dev/null`, { stdio: 'pipe' })
    execSync(`docker rm ${CONTAINER_NAME} 2>/dev/null`, { stdio: 'pipe' })
  } catch {
    // Container didn't exist, that's fine
  }

  // Start new container
  execSync(`docker run -d --name ${CONTAINER_NAME} -p ${TEST_PORT}:5432 -e POSTGRES_PASSWORD=${TEST_PASSWORD} -e POSTGRES_DB=${TEST_DB} postgres:15`, { stdio: 'pipe' })

  // Wait for postgres to be ready
  let ready = false
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`docker exec ${CONTAINER_NAME} pg_isready -U ${TEST_USER}`, { stdio: 'pipe' })
      ready = true
      break
    } catch {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  if (!ready) {
    throw new Error('PostgreSQL failed to start')
  }

  logSuccess('PostgreSQL started')
}

async function runMigrations(pool: pg.Pool): Promise<void> {
  logStep(2, 'Running migrations...')

  const migrationsDir = join(projectRoot, 'migrations')
  const files = readdirSync(migrationsDir).sort()

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `)

  // Run SQL migrations (skip 022 - we'll run it as the test)
  for (const file of files) {
    if (!file.endsWith('.sql')) continue
    if (file.includes('022')) continue

    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    try {
      await pool.query(sql)
      await pool.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file])
    } catch (e: any) {
      // Some migrations may fail on fresh DB, that's okay for this test
      if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
        console.log(`    Warning: ${file}: ${e.message.slice(0, 50)}`)
      }
    }
  }

  // Run JS migrations except 022
  for (const file of files) {
    if (!file.endsWith('.js')) continue
    if (file.includes('022')) continue

    try {
      const migration = await import(join(migrationsDir, file))
      if (migration.run) {
        const client = await pool.connect()
        try {
          await migration.run(client)
          await pool.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file])
        } finally {
          client.release()
        }
      }
    } catch (e: any) {
      console.log(`    Warning: ${file}: ${e.message.slice(0, 50)}`)
    }
  }

  logSuccess('Migrations completed')
}

async function insertTestData(pool: pg.Pool): Promise<TestData> {
  logStep(3, 'Inserting test data...')

  // Create a test user
  const userResult = await pool.query(`
    INSERT INTO users (id, discord_id, username, avatar_url)
    VALUES (gen_random_uuid(), '123456789', 'TestUser', 'https://example.com/avatar.png')
    RETURNING id
  `)
  const userId = userResult.rows[0].id

  // Create test packs with a showcase leader
  const testPacks = [
    {
      cards: [
        { id: '1359', name: 'Director Krennic', subtitle: 'Aspiring to Authority', type: 'Leader', rarity: 'Common', variantType: 'Showcase', isLeader: true, isShowcase: true, set: 'SOR', aspects: ['Vigilance', 'Villainy'] },
        { id: '100', name: 'Test Card 1', type: 'Unit', rarity: 'Common', variantType: 'Normal', set: 'SOR', aspects: ['Command'] },
        { id: '101', name: 'Test Card 2', type: 'Unit', rarity: 'Uncommon', variantType: 'Normal', set: 'SOR', aspects: ['Aggression'] },
      ]
    },
    {
      cards: [
        { id: '200', name: 'Test Leader', type: 'Leader', rarity: 'Rare', variantType: 'Normal', isLeader: true, set: 'SOR', aspects: ['Command'] },
        { id: '201', name: 'Test Card 3', type: 'Unit', rarity: 'Common', variantType: 'Hyperspace', isHyperspace: true, set: 'SOR', aspects: ['Cunning'] },
        { id: '202', name: 'Test Foil', type: 'Unit', rarity: 'Rare', variantType: 'Normal', isFoil: true, set: 'SOR', aspects: ['Villainy'] },
      ]
    }
  ]

  // Create pool WITHOUT tracking (simulating the bug)
  const poolResult = await pool.query(`
    INSERT INTO card_pools (id, user_id, share_id, set_code, set_name, pool_type, cards, packs, is_public)
    VALUES (gen_random_uuid(), $1, 'TEST001', 'SOR', 'Spark of Rebellion', 'sealed', $2, $3, true)
    RETURNING id, share_id
  `, [
    userId,
    JSON.stringify(testPacks.flatMap(p => p.cards)),
    JSON.stringify(testPacks)
  ])

  // Create another pool that already has tracking (should be skipped)
  const pool2Result = await pool.query(`
    INSERT INTO card_pools (id, user_id, share_id, set_code, set_name, pool_type, cards, packs, is_public)
    VALUES (gen_random_uuid(), $1, 'TEST002', 'SOR', 'Spark of Rebellion', 'sealed', $2, $3, true)
    RETURNING id, share_id
  `, [
    userId,
    JSON.stringify([{ id: '300', name: 'Already Tracked', type: 'Unit', rarity: 'Common', variantType: 'Normal', set: 'SOR' }]),
    JSON.stringify([[{ id: '300', name: 'Already Tracked', type: 'Unit', rarity: 'Common', variantType: 'Normal', set: 'SOR' }]])
  ])
  const pool2Id = pool2Result.rows[0].id

  // Add tracking record for pool2 (so it gets skipped)
  await pool.query(`
    INSERT INTO card_generations (card_id, set_code, card_name, card_type, rarity, treatment, variant_type, pack_type, slot_type, source_type, source_id, source_share_id, user_id)
    VALUES ('300', 'SOR', 'Already Tracked', 'Unit', 'Common', 'base', 'Normal', 'booster', 'common', 'sealed', $1, 'TEST002', $2)
  `, [pool2Id, userId])

  // Create a pool with old array format packs (for backwards compat testing)
  const oldFormatPacks = [
    [
      { id: '400', name: 'Old Format Card', type: 'Unit', rarity: 'Common', variantType: 'Normal', set: 'SHD', aspects: ['Command'] }
    ]
  ]

  await pool.query(`
    INSERT INTO card_pools (id, user_id, share_id, set_code, set_name, pool_type, cards, packs, is_public)
    VALUES (gen_random_uuid(), $1, 'TEST003', 'SHD', 'Shadows of the Galaxy', 'sealed', $2, $3, true)
  `, [
    userId,
    JSON.stringify(oldFormatPacks.flat()),
    JSON.stringify(oldFormatPacks)
  ])

  // Create a draft pod with old array format all_packs (for migration 023 testing)
  const oldDraftPacks = [
    // Player 1's packs (3 packs, each as raw array - OLD FORMAT)
    [
      [{ id: '500', name: 'Draft Card 1', type: 'Unit', rarity: 'Common' }],
      [{ id: '501', name: 'Draft Card 2', type: 'Unit', rarity: 'Uncommon' }],
      [{ id: '502', name: 'Draft Card 3', type: 'Unit', rarity: 'Rare' }]
    ],
    // Player 2's packs
    [
      [{ id: '503', name: 'Draft Card 4', type: 'Unit', rarity: 'Common' }],
      [{ id: '504', name: 'Draft Card 5', type: 'Unit', rarity: 'Uncommon' }],
      [{ id: '505', name: 'Draft Card 6', type: 'Unit', rarity: 'Rare' }]
    ]
  ]

  const draftPodResult = await pool.query(`
    INSERT INTO pods (id, share_id, host_id, set_code, status, all_packs, max_players, current_players)
    VALUES (gen_random_uuid(), 'DRAFT001', $1, 'SOR', 'active', $2, 8, 2)
    RETURNING id
  `, [userId, JSON.stringify(oldDraftPacks)])

  logSuccess(`Created test user: ${userId}`)
  logSuccess(`Created pool TEST001 (no tracking, has showcase leader)`)
  logSuccess(`Created pool TEST002 (already tracked, should skip)`)
  logSuccess(`Created pool TEST003 (old array format)`)

  return { userId, poolShareId: poolResult.rows[0].share_id }
}

async function runBackfillMigration(pool: pg.Pool): Promise<void> {
  logStep(4, 'Running backfill migration 022...')

  const migration = await import(join(projectRoot, 'migrations', '022_backfill_sealed_tracking.js'))
  const client = await pool.connect()
  try {
    await migration.run(client)
  } finally {
    client.release()
  }

  logSuccess('Migration completed')
}

async function runPackFormatMigration(pool: pg.Pool): Promise<void> {
  logStep('4b', 'Running pack format migration 023...')

  const migration = await import(join(projectRoot, 'migrations', '023_normalize_pack_format.js'))
  const client = await pool.connect()
  try {
    await migration.run(client)
  } finally {
    client.release()
  }

  logSuccess('Migration completed')
}

async function verifyResults(pool: pg.Pool, testData: TestData): Promise<boolean> {
  logStep(5, 'Verifying results...')

  let allPassed = true

  // Check TEST001 was tracked
  const test001Result = await pool.query(`
    SELECT COUNT(*) as count,
           COUNT(*) FILTER (WHERE treatment = 'showcase' AND card_type = 'Leader') as showcase_leaders
    FROM card_generations
    WHERE source_share_id = 'TEST001'
  `)

  if (parseInt(test001Result.rows[0].count) === 6) {
    logSuccess(`TEST001: ${test001Result.rows[0].count} cards tracked`)
  } else {
    logError(`TEST001: Expected 6 cards, got ${test001Result.rows[0].count}`)
    allPassed = false
  }

  if (parseInt(test001Result.rows[0].showcase_leaders) === 1) {
    logSuccess(`TEST001: ${test001Result.rows[0].showcase_leaders} showcase leader tracked`)
  } else {
    logError(`TEST001: Expected 1 showcase leader, got ${test001Result.rows[0].showcase_leaders}`)
    allPassed = false
  }

  // Check TEST002 was skipped (still has only 1 record)
  const test002Result = await pool.query(`
    SELECT COUNT(*) as count FROM card_generations WHERE source_share_id = 'TEST002'
  `)

  if (parseInt(test002Result.rows[0].count) === 1) {
    logSuccess(`TEST002: Skipped (already tracked)`)
  } else {
    logError(`TEST002: Expected 1 record (skipped), got ${test002Result.rows[0].count}`)
    allPassed = false
  }

  // Check TEST003 (old format) was tracked
  const test003Result = await pool.query(`
    SELECT COUNT(*) as count FROM card_generations WHERE source_share_id = 'TEST003'
  `)

  if (parseInt(test003Result.rows[0].count) === 1) {
    logSuccess(`TEST003: ${test003Result.rows[0].count} card tracked (old format)`)
  } else {
    logError(`TEST003: Expected 1 card, got ${test003Result.rows[0].count}`)
    allPassed = false
  }

  // Check user_id is set correctly
  const userIdResult = await pool.query(`
    SELECT COUNT(*) as count FROM card_generations
    WHERE source_share_id = 'TEST001' AND user_id = $1
  `, [testData.userId])

  if (parseInt(userIdResult.rows[0].count) === 6) {
    logSuccess(`User ID correctly attributed`)
  } else {
    logError(`User ID not correctly attributed`)
    allPassed = false
  }

  // Check showcase can be queried via the API pattern
  const showcaseQuery = await pool.query(`
    SELECT card_name, card_subtitle FROM card_generations
    WHERE user_id = $1 AND treatment = 'showcase' AND card_type = 'Leader'
  `, [testData.userId])

  if (showcaseQuery.rows.length === 1 && showcaseQuery.rows[0].card_name === 'Director Krennic') {
    logSuccess(`Showcase query works: ${showcaseQuery.rows[0].card_name}`)
  } else {
    logError(`Showcase query failed`)
    allPassed = false
  }

  return allPassed
}

async function verifyPackFormat(pool: pg.Pool): Promise<boolean> {
  logStep('5b', 'Verifying pack format migration...')

  let allPassed = true

  // Check draft pod packs were converted to object format
  const draftResult = await pool.query(`
    SELECT all_packs FROM pods WHERE share_id = 'DRAFT001'
  `)

  if (draftResult.rows.length === 0) {
    logError('DRAFT001 not found')
    return false
  }

  const allPacks = typeof draftResult.rows[0].all_packs === 'string'
    ? JSON.parse(draftResult.rows[0].all_packs)
    : draftResult.rows[0].all_packs

  // Check first player's first pack is now object format
  const firstPack = allPacks[0][0]
  if (firstPack && typeof firstPack === 'object' && !Array.isArray(firstPack) && firstPack.cards) {
    logSuccess('Draft packs converted to object format')
  } else {
    logError(`Draft packs not converted. Got: ${JSON.stringify(firstPack).slice(0, 50)}`)
    allPassed = false
  }

  // Verify cards are preserved
  if (firstPack.cards && firstPack.cards[0]?.name === 'Draft Card 1') {
    logSuccess('Card data preserved after conversion')
  } else {
    logError('Card data not preserved')
    allPassed = false
  }

  // Count total packs converted
  let packCount = 0
  for (const playerPacks of allPacks) {
    for (const pack of playerPacks) {
      if (pack && pack.cards) packCount++
    }
  }

  if (packCount === 6) {
    logSuccess(`All 6 packs in correct format`)
  } else {
    logError(`Expected 6 packs, got ${packCount}`)
    allPassed = false
  }

  return allPassed
}

async function cleanup(): Promise<void> {
  logStep(6, 'Cleaning up...')

  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' })
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' })
    logSuccess('Container removed')
  } catch (e: any) {
    logError(`Cleanup failed: ${e.message}`)
  }
}

async function main(): Promise<void> {
  log('\n' + '='.repeat(60), colors.cyan)
  log('Testing Migration 022: Backfill Sealed Tracking', colors.cyan)
  log('='.repeat(60), colors.cyan)

  let pool: pg.Pool | null = null
  let success = false

  try {
    await startPostgres()

    pool = new Pool({ connectionString: TEST_URL })

    await runMigrations(pool)

    const testData = await insertTestData(pool)

    await runBackfillMigration(pool)

    success = await verifyResults(pool, testData)

    // Run pack format migration
    await runPackFormatMigration(pool)

    // Verify pack format migration
    const packFormatSuccess = await verifyPackFormat(pool)
    success = success && packFormatSuccess

  } catch (error: any) {
    logError(`Test failed: ${error.message}`)
    console.error(error)
  } finally {
    if (pool) {
      await pool.end()
    }
    await cleanup()
  }

  log('\n' + '='.repeat(60), colors.cyan)
  if (success) {
    log('✅ ALL TESTS PASSED', colors.green)
  } else {
    log('❌ SOME TESTS FAILED', colors.red)
    process.exit(1)
  }
  log('='.repeat(60) + '\n', colors.cyan)
}

main()
