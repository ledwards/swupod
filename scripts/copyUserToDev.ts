#!/usr/bin/env npx tsx
// @ts-nocheck
//
// Copy ONE user's data from prod into dev so /me (and other personal views)
// render against real data locally. Reads from PROD_DATABASE_URL, writes to
// DATABASE_URL (your dev DB). Idempotent: every insert is ON CONFLICT DO
// NOTHING, so re-running tops up without clobbering.
//
// Usage:
//   PROD_DATABASE_URL="postgres://…prod…" \
//   DATABASE_URL="postgres://…dev…" \
//   npx tsx scripts/copyUserToDev.ts terronk
//   npx tsx scripts/copyUserToDev.ts --discord 123456789
//
// Safety:
//   - Refuses to run if PROD_DATABASE_URL and DATABASE_URL resolve to the same
//     host:port/db (so you can't accidentally write to prod).
//   - Only ever INSERTs (never updates/deletes) into the target.
//
// What it copies (the tables the personal-stats counters + history read):
//   users (target + referenced opponents/hosts/co-drafters),
//   pods, pod_players, card_pools, card_generations, built_decks,
//   deck_play_visits, practice_matches, pool_views.
//
// NOTE: this moves real player data into your dev DB. Never commit dev dumps
// or that data to the repo.

import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const SOURCE_URL = process.env.PROD_DATABASE_URL || process.env.SOURCE_DATABASE_URL
const TARGET_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL

function makePool(connectionString: string) {
  return new Pool({
    connectionString,
    ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  })
}

/** Normalise a connection string to host:port/db for the same-DB guard. */
function dbIdentity(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return url
  }
}

async function tableColumns(pool: pg.Pool, table: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  )
  return rows.map((r: any) => r.column_name)
}

/**
 * Insert rows into the target table, intersecting each row's keys with the
 * target's actual columns (so a column that only exists in prod is dropped).
 * ON CONFLICT (id) DO NOTHING keeps it idempotent and non-destructive.
 */
async function insertRows(
  target: pg.Pool,
  table: string,
  rows: any[],
  targetCols: Set<string>
): Promise<number> {
  let inserted = 0
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => targetCols.has(c))
    if (cols.length === 0) continue
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const values = cols.map((c) => {
      const v = row[c]
      // pg returns json/jsonb as parsed objects; re-stringify for insert.
      return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
        ? JSON.stringify(v)
        : v
    })
    try {
      const res = await target.query(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (id) DO NOTHING`,
        values
      )
      inserted += res.rowCount || 0
    } catch (e: any) {
      console.warn(`  ! skip one ${table} row: ${e.message}`)
    }
  }
  return inserted
}

async function fetchRows(pool: pg.Pool, sql: string, params: any[] = []): Promise<any[]> {
  const { rows } = await pool.query(sql, params)
  return rows
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs.filter((x) => x != null)))
}

async function main() {
  const args = process.argv.slice(2)
  const isDiscord = args[0] === '--discord'
  const identifier = isDiscord ? args[1] : args[0]

  if (!identifier) {
    console.error('Usage: npx tsx scripts/copyUserToDev.ts <username|email> | --discord <id>')
    process.exit(1)
  }
  if (!SOURCE_URL) {
    console.error('Error: set PROD_DATABASE_URL (the source / prod database).')
    process.exit(1)
  }
  if (!TARGET_URL) {
    console.error('Error: set DATABASE_URL (the target / dev database).')
    process.exit(1)
  }
  if (dbIdentity(SOURCE_URL) === dbIdentity(TARGET_URL)) {
    console.error('Refusing to run: source and target are the SAME database. Point DATABASE_URL at dev.')
    process.exit(1)
  }

  const source = makePool(SOURCE_URL)
  const target = makePool(TARGET_URL)

  console.log(`\n📋 Copy user data`)
  console.log(`   source (prod): ${dbIdentity(SOURCE_URL)}`)
  console.log(`   target (dev):  ${dbIdentity(TARGET_URL)}\n`)

  try {
    // 1. Resolve the user in prod.
    const userRows = await fetchRows(
      source,
      isDiscord
        ? `SELECT * FROM users WHERE discord_id = $1 LIMIT 1`
        : `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
      [identifier]
    )
    if (userRows.length === 0) {
      console.error(`No prod user matched "${identifier}".`)
      process.exit(1)
    }
    const user = userRows[0]
    const userId = user.id
    console.log(`✅ Found prod user: ${user.username || user.email} (${userId})`)

    // 2. Pull the user's rows from each source table.
    const pods = await fetchRows(
      source,
      `SELECT p.* FROM pods p
       JOIN pod_players pp ON pp.pod_id = p.id
       WHERE pp.user_id = $1`,
      [userId]
    )
    const podIds = uniq(pods.map((p) => p.id))

    const podPlayers = podIds.length
      ? await fetchRows(source, `SELECT * FROM pod_players WHERE pod_id = ANY($1)`, [podIds])
      : []

    const pools = await fetchRows(
      source,
      `SELECT * FROM card_pools
       WHERE user_id = $1
          OR id IN (SELECT COALESCE(parent_pool_id, id) FROM card_pools WHERE user_id = $1)
          OR id IN (SELECT pool_id FROM pool_views WHERE user_id = $1)`,
      [userId]
    )
    const poolIds = uniq(pools.map((p) => p.id))

    const cardGenerations = await fetchRows(
      source,
      `SELECT * FROM card_generations
       WHERE user_id = $1
          OR (source_type = 'sealed' AND source_id = ANY($2))
          OR (source_type = 'draft' AND source_id = ANY($3))`,
      [userId, poolIds, podIds]
    )

    const builtDecks = poolIds.length
      ? await fetchRows(source, `SELECT * FROM built_decks WHERE card_pool_id = ANY($1)`, [poolIds])
      : []

    const deckPlayVisits = await fetchRows(source, `SELECT * FROM deck_play_visits WHERE user_id = $1`, [userId])

    const practiceMatches = await fetchRows(
      source,
      `SELECT * FROM practice_matches WHERE player1_id = $1 OR player2_id = $1`,
      [userId]
    )

    const poolViews = await fetchRows(source, `SELECT * FROM pool_views WHERE user_id = $1`, [userId])

    // 3. Collect every referenced user (hosts, opponents, co-drafters) so the
    //    FK targets exist in dev, then fetch their full rows.
    const refUserIds = uniq([
      userId,
      ...pods.map((p) => p.host_id),
      ...pods.map((p) => p.user_id),
      ...podPlayers.map((pp) => pp.user_id),
      ...practiceMatches.map((m) => m.player1_id),
      ...practiceMatches.map((m) => m.player2_id),
      ...pools.map((p) => p.user_id),
    ])
    const refUsers = await fetchRows(source, `SELECT * FROM users WHERE id = ANY($1)`, [refUserIds])

    // 4. Insert into dev in FK-safe order. card_pools is inserted parent-first
    //    (loop) to satisfy its self-referencing parent_pool_id FK.
    const order: Array<[string, any[]]> = [
      ['users', refUsers],
      ['pods', pods],
      ['pod_players', podPlayers],
      ['card_generations', cardGenerations],
      ['built_decks', builtDecks],
      ['deck_play_visits', deckPlayVisits],
      ['practice_matches', practiceMatches],
      ['pool_views', poolViews],
    ]

    // card_pools first (parent-first) since other tables FK to it.
    const poolCols = new Set(await tableColumns(target, 'card_pools'))
    const insertedPoolIds = new Set<string>()
    let remaining = [...pools]
    let progress = true
    let poolInserted = 0
    while (remaining.length && progress) {
      progress = false
      const next: any[] = []
      for (const p of remaining) {
        const parentReady = !p.parent_pool_id || insertedPoolIds.has(p.parent_pool_id)
        if (parentReady) {
          poolInserted += await insertRows(target, 'card_pools', [p], poolCols)
          insertedPoolIds.add(p.id)
          progress = true
        } else {
          next.push(p)
        }
      }
      remaining = next
    }
    if (remaining.length) {
      // Parents live outside this set; insert anyway (FK may point at an
      // already-present row) so we don't silently drop them.
      poolInserted += await insertRows(target, 'card_pools', remaining, poolCols)
    }

    // users must go before pods/etc.
    const counts: Record<string, number> = { card_pools: poolInserted }
    // Re-order so users is first.
    for (const [table, rows] of order) {
      if (rows.length === 0) {
        counts[table] = 0
        continue
      }
      const cols = new Set(await tableColumns(target, table))
      counts[table] = await insertRows(target, table, rows, cols)
    }

    console.log('\n✅ Done. Inserted (new rows; existing skipped):')
    console.log(`   users:            ${counts.users}/${refUsers.length}`)
    console.log(`   pods:             ${counts.pods}/${pods.length}`)
    console.log(`   pod_players:      ${counts.pod_players}/${podPlayers.length}`)
    console.log(`   card_pools:       ${counts.card_pools}/${pools.length}`)
    console.log(`   card_generations: ${counts.card_generations}/${cardGenerations.length}`)
    console.log(`   built_decks:      ${counts.built_decks}/${builtDecks.length}`)
    console.log(`   deck_play_visits: ${counts.deck_play_visits}/${deckPlayVisits.length}`)
    console.log(`   practice_matches: ${counts.practice_matches}/${practiceMatches.length}`)
    console.log(`   pool_views:       ${counts.pool_views}/${poolViews.length}`)
    console.log(`\n   Open /me as ${user.username || identifier} in dev to verify.\n`)
  } catch (err: any) {
    console.error('Copy failed:', err.message)
    process.exitCode = 1
  } finally {
    await source.end().catch(() => {})
    await target.end().catch(() => {})
  }
}

main()
