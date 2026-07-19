#!/usr/bin/env npx tsx
// @ts-nocheck
//
// Copy ONE user's data from prod into dev so /me (and other personal views)
// render against real data locally.
//
// Usage (one command — auto-resolves source/target from your env files):
//   npm run copy-user-to-dev -- terronk
//   npm run copy-user-to-dev -- --discord 123456789
//
// This script only chooses WHICH rows to copy. Everything that makes the copy
// referentially correct — pulling in every referenced user/pod/practice_round,
// insert ordering, unique-constraint handling, sequence resync, and a post-copy
// integrity check — is handled generically by scripts/lib/dbCopy.ts from the
// target's own catalog. See that file for why.
//
// NOTE: this moves real player data into your dev DB. Never commit dev dumps
// or that data to the repo.

import 'dotenv/config'
import { resolveConnections, makePool, dbIdentity } from './lib/dbEnv'
import { introspectSchema, copyClosure, printReport } from './lib/dbCopy'

async function fetchRows(pool, sql: string, params: any[] = []): Promise<any[]> {
  const { rows } = await pool.query(sql, params)
  return rows
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs.filter((x) => x != null)))
}

/**
 * Seed fetch for an optional table. A table that a migration has not created
 * yet (or has since renamed) should degrade to "nothing to copy" rather than
 * aborting the whole run — the schema is the target's, not this script's.
 */
function seedFetcher(source, schema, seeds: Map<string, any[]>) {
  return async (table: string, sql: string, params: any[] = []) => {
    if (!schema.tables.has(table)) {
      console.log(`  · skipping ${table} (not in target schema)`)
      return
    }
    const rows = await fetchRows(source, sql, params)
    if (rows.length) seeds.set(table, rows)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isDiscord = args[0] === '--discord'
  const identifier = isDiscord ? args[1] : args[0]

  if (!identifier) {
    console.error('Usage: npm run copy-user-to-dev -- <username|email>')
    console.error('       npm run copy-user-to-dev -- --discord <id>')
    process.exit(1)
  }

  const { sourceUrl, targetUrl } = resolveConnections()
  const source = makePool(sourceUrl)
  const target = makePool(targetUrl)

  console.log(`\n📋 Copy user data`)
  console.log(`   source (prod): ${dbIdentity(sourceUrl)}`)
  console.log(`   target (dev):  ${dbIdentity(targetUrl)}\n`)

  try {
    const schema = await introspectSchema(target)

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

    // 2. Seed rows: the things that are the USER'S. Every row these point at
    //    (co-drafters, opponents, hosts, practice_rounds) is pulled in
    //    automatically by the FK closure — we never hand-collect referenced ids.
    const seeds = new Map<string, any[]>()
    seeds.set('users', [user])
    const seed = seedFetcher(source, schema, seeds)

    const pods = await fetchRows(
      source,
      `SELECT p.* FROM pods p
       JOIN pod_players pp ON pp.pod_id = p.id
       WHERE pp.user_id = $1`,
      [userId]
    )
    const podIds = uniq(pods.map((p) => p.id))
    seeds.set('pods', pods)

    if (podIds.length) {
      await seed('pod_players', `SELECT * FROM pod_players WHERE pod_id = ANY($1)`, [podIds])
      // Every pick in every pod the user drafted, so the Meta "most/least
      // drafted" aggregates are realistic rather than one-seat-shaped.
      await seed('draft_picks', `SELECT * FROM draft_picks WHERE pod_id = ANY($1)`, [podIds])
    }

    const pools = await fetchRows(
      source,
      `SELECT * FROM card_pools
       WHERE user_id = $1
          OR id IN (SELECT COALESCE(parent_pool_id, id) FROM card_pools WHERE user_id = $1)
          OR parent_pool_id IN (SELECT COALESCE(parent_pool_id, id) FROM card_pools WHERE user_id = $1)
          OR id IN (SELECT pool_id FROM pool_views WHERE user_id = $1)`,
      [userId]
    )
    const poolIds = uniq(pools.map((p) => p.id))
    seeds.set('card_pools', pools)

    await seed('card_generations',
      `SELECT * FROM card_generations
       WHERE user_id = $1
          OR (source_type = 'sealed' AND source_id = ANY($2))
          OR (source_type = 'draft'  AND source_id = ANY($3))`,
      [userId, poolIds, podIds])
    if (poolIds.length) {
      await seed('built_decks', `SELECT * FROM built_decks WHERE card_pool_id = ANY($1)`, [poolIds])
    }
    await seed('deck_play_visits', `SELECT * FROM deck_play_visits WHERE user_id = $1`, [userId])
    await seed('practice_matches',
      `SELECT * FROM practice_matches WHERE player1_id = $1 OR player2_id = $1`, [userId])
    await seed('pool_views', `SELECT * FROM pool_views WHERE user_id = $1`, [userId])
    // Casual match history — the source of the W-L records on pools and /me.
    await seed('casual_matches', `SELECT * FROM casual_matches WHERE user_id = $1`, [userId])

    // 3. Closure → ordered insert → sequence resync → integrity check.
    const result = await copyClosure({ source, target, schema, seeds, log: (m) => console.log(m) })
    printReport(result)

    console.log(`\n   Open /me as ${user.username || identifier} in dev to verify.\n`)

    if (result.dangling.length) process.exitCode = 1
  } catch (err: any) {
    console.error('Copy failed:', err.message)
    process.exitCode = 1
  } finally {
    await source.end().catch(() => {})
    await target.end().catch(() => {})
  }
}

main()
