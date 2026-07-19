#!/usr/bin/env npx tsx
// @ts-nocheck
//
// Copy POOLS from prod into dev so the pool pages, deck builder, and the
// "Decks from this Pool" strip render against real data locally.
//
// Two modes:
//
//   By share id — copies that pool's whole family (root + every build on it):
//     npm run copy-pool -- abc123
//
//   By set — copies the N most recent pools for a set that actually have a
//   built deck, newest first. This is the one for "I have no data for LAW":
//     npm run copy-pool -- --set LAW
//     npm run copy-pool -- --set LAW --limit 10
//
// This script only chooses WHICH pools to copy. Everything that makes the copy
// referentially correct — pulling in every referenced user/pod/round, insert
// ordering, unique-constraint handling, sequence resync, and a post-copy
// integrity check — is handled generically by scripts/lib/dbCopy.ts from the
// target's own catalog. See that file for why.
//
// NOTE: this moves real player data into your dev DB. Never commit dev dumps
// or that data to the repo.

import 'dotenv/config'
import { resolveConnections, makePool, dbIdentity } from './lib/dbEnv'
import { introspectSchema, copyClosure, printReport } from './lib/dbCopy'

const DEFAULT_SET_LIMIT = 5

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  let setCode: string | null = null
  let limit = DEFAULT_SET_LIMIT
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--set') { setCode = args[++i]; continue }
    if (args[i] === '--limit') { limit = parseInt(args[++i], 10); continue }
    positional.push(args[i])
  }
  return { setCode, limit, shareId: positional[0] || null }
}

async function fetchRows(pool, sql: string, params: any[] = []): Promise<any[]> {
  const { rows } = await pool.query(sql, params)
  return rows
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

/**
 * Resolve the ROOT pool ids to copy.
 *
 * `deck_builder_state` is jsonb but has historically been written both as a
 * real object AND as a JSON-encoded string (which is why the API parses it
 * with jsonParse rather than trusting it). `jsonb_typeof` lets us handle both:
 * an object is probed directly, a string is re-parsed first. Getting this wrong
 * silently returns zero pools, which is exactly the "no data for this set"
 * symptom this script exists to fix.
 */
async function resolveRootIds(source, opts: { shareId: string | null; setCode: string | null; limit: number }): Promise<string[]> {
  if (opts.shareId) {
    const rows = await fetchRows(
      source,
      `SELECT COALESCE(parent_pool_id, id) AS root_id FROM card_pools WHERE share_id = $1`,
      [opts.shareId]
    )
    return rows.length ? [rows[0].root_id] : []
  }

  const rows = await fetchRows(
    source,
    `SELECT DISTINCT ON (root_id) root_id, created_at FROM (
       SELECT COALESCE(cp.parent_pool_id, cp.id) AS root_id, cp.created_at
       FROM card_pools cp
       WHERE cp.set_code = $1
         AND cp.deck_builder_state IS NOT NULL
         AND CASE jsonb_typeof(cp.deck_builder_state)
               WHEN 'object' THEN cp.deck_builder_state->>'activeLeader'
               WHEN 'string' THEN (cp.deck_builder_state #>> '{}')::jsonb->>'activeLeader'
               ELSE NULL
             END IS NOT NULL
     ) t
     ORDER BY root_id, created_at DESC`,
    [opts.setCode]
  )
  return rows
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, opts.limit)
    .map((r) => r.root_id)
}

async function main() {
  const { setCode, limit, shareId } = parseArgs(process.argv)

  if (!shareId && !setCode) {
    console.error('Usage: npm run copy-pool -- <shareId>')
    console.error('       npm run copy-pool -- --set <SET_CODE> [--limit N]')
    process.exit(1)
  }
  if (setCode && (!Number.isFinite(limit) || limit < 1)) {
    console.error(`Error: --limit must be a positive number (got "${limit}").`)
    process.exit(1)
  }

  const { sourceUrl, targetUrl } = resolveConnections()
  const source = makePool(sourceUrl)
  const target = makePool(targetUrl)

  console.log(`\n📋 Copy pool data`)
  console.log(`   source (prod): ${dbIdentity(sourceUrl)}`)
  console.log(`   target (dev):  ${dbIdentity(targetUrl)}`)
  console.log(`   selecting:     ${shareId ? `share_id ${shareId}` : `set ${setCode} (newest ${limit} with a built deck)`}\n`)

  try {
    const schema = await introspectSchema(target)

    // 1. Which pool families are we copying?
    const rootIds = await resolveRootIds(source, { shareId, setCode, limit })
    if (rootIds.length === 0) {
      console.error(shareId
        ? `No prod pool matched share id "${shareId}".`
        : `No prod pools with a built deck found for set "${setCode}".`)
      process.exit(1)
    }

    // 2. Seed rows: the roots plus every build hanging off them, and the rows
    //    that reference those pools. Everything those rows point AT is pulled
    //    in automatically by the FK closure — we never hand-collect user ids.
    const pools = await fetchRows(
      source,
      `SELECT * FROM card_pools WHERE id = ANY($1) OR parent_pool_id = ANY($1)`,
      [rootIds]
    )
    const poolIds = pools.map((p) => p.id)
    const podIds = [...new Set(pools.map((p) => p.pod_id).filter(Boolean))]
    console.log(`✅ ${rootIds.length} pool family/families → ${pools.length} pools (roots + builds)`)

    const seeds = new Map<string, any[]>()
    seeds.set('card_pools', pools)
    const seed = seedFetcher(source, schema, seeds)

    if (podIds.length) {
      await seed('pod_players', `SELECT * FROM pod_players WHERE pod_id = ANY($1)`, [podIds])
      await seed('draft_picks', `SELECT * FROM draft_picks WHERE pod_id = ANY($1)`, [podIds])
    }
    await seed('card_generations',
      `SELECT * FROM card_generations
       WHERE (source_type = 'sealed' AND source_id = ANY($1))
          OR (source_type = 'draft'  AND source_id = ANY($2))`,
      [poolIds, podIds])
    await seed('built_decks', `SELECT * FROM built_decks WHERE card_pool_id = ANY($1)`, [poolIds])
    await seed('pool_views', `SELECT * FROM pool_views WHERE pool_id = ANY($1)`, [poolIds])
    // Match history is what turns "No games yet" into a real W-L record.
    await seed('casual_matches', `SELECT * FROM casual_matches WHERE card_pool_id = ANY($1)`, [poolIds])
    await seed('deck_play_visits', `SELECT * FROM deck_play_visits WHERE pool_id = ANY($1)`, [poolIds])

    // 3. Closure → ordered insert → sequence resync → integrity check.
    const result = await copyClosure({ source, target, schema, seeds, log: (m) => console.log(m) })
    printReport(result)

    const roots = pools.filter((p) => rootIds.includes(p.id))
    console.log('\n   Open locally:')
    for (const r of roots) {
      const path = r.pool_type === 'draft' ? 'draft_pool' : 'sealed_pool'
      console.log(`     http://localhost:3000/${path}/${r.share_id}   (${r.set_code})`)
    }
    console.log('')

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
