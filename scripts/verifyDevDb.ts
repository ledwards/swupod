#!/usr/bin/env npx tsx
// @ts-nocheck
//
// Health-check the DEV database after any clone/copy/pull, and repair the parts
// that are safe to repair automatically.
//
//   npm run db:verify          # report only, touches nothing
//   npm run db:verify -- --fix # additionally re-sync out-of-step sequences
//
// What it checks, and why each one is a real failure mode of a copy:
//
//   1. DANGLING FOREIGN KEYS. Enforced FKs make this impossible during a normal
//      per-row copy, but a pg_dump/psql restore (clone-prod-to-local,
//      clone-prod-to-dev.sh) loads with triggers disabled, so a partial or
//      interrupted restore CAN leave orphans behind.
//   2. DANGLING POLYMORPHIC REFERENCES. card_generations.source_id points at
//      card_pools.id or pods.id depending on source_type and has NO foreign
//      key, so nothing at the DB level notices when the referenced pool or pod
//      was never copied. These surface in the app as pools with missing
//      generation history.
//   3. SEQUENCE DRIFT. Tables with SERIAL ids (card_generations, draft_picks)
//      keep their sequence where it was when rows are copied with explicit ids.
//      The next insert the local app makes then collides with a copied row and
//      fails — the classic "worked yesterday, now every save 500s" after a pull.
//   4. ORPHANED POOL FAMILIES. A build whose parent_pool_id points at a pool
//      that wasn't copied. The FK is ON DELETE SET NULL and the column is
//      nullable, so this is legal at the DB level but wrong in the app: the
//      build silently becomes its own root and detaches from its pool.
//
// --fix only performs additive, non-destructive repairs (sequence resync).
// Anything requiring a DELETE is reported with the SQL to run, never executed.

import 'dotenv/config'
import { resolveConnections, makePool, dbIdentity } from './lib/dbEnv'
import { introspectSchema, verifyIntegrity, resyncSequences, danglingDeleteSql } from './lib/dbCopy'

async function main() {
  const fix = process.argv.includes('--fix')

  // Dev-only tool: never needs a prod connection.
  const { targetUrl } = resolveConnections({ requireSource: false })
  const target = makePool(targetUrl)

  console.log(`\n🔍 Verifying dev database`)
  console.log(`   target (dev): ${dbIdentity(targetUrl)}`)
  console.log(`   mode:         ${fix ? 'verify + fix (sequences only)' : 'verify only (read-only)'}\n`)

  let problems = 0

  try {
    const schema = await introspectSchema(target)
    const allTables = [...schema.tables.keys()].sort()

    // 1 + 2. Dangling FKs and polymorphic references, across every table.
    const dangling = await verifyIntegrity(target, allTables, schema)
    if (dangling.length) {
      problems += dangling.length
      console.log('❌ Dangling references:')
      for (const d of dangling) {
        console.log(`\n   ${d.table}.${d.label} -> ${d.refTable}: ${d.count} row(s) with no parent`)
        console.log(`   ${danglingDeleteSql(d).split('\n').join('\n   ')}`)
      }
      console.log('\n   (not auto-deleted — review before running)')
    } else {
      console.log('✅ Foreign keys: no dangling references.')
    }

    // 3. Sequence drift.
    const drifted: string[] = []
    for (const table of allTables) {
      const pk = schema.tables.get(table)?.primaryKey
      if (!pk || pk.length !== 1) continue
      const { rows: s } = await target.query(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [table, pk[0]])
      if (!s[0]?.seq) continue
      const { rows } = await target.query(
        `SELECT COALESCE((SELECT MAX("${pk[0]}") FROM ${table}), 0) AS max_id,
                (SELECT last_value FROM ${s[0].seq}) AS seq_val`
      )
      if (Number(rows[0].max_id) > Number(rows[0].seq_val)) {
        drifted.push(`${table}.${pk[0]} (max id ${rows[0].max_id} > sequence ${rows[0].seq_val})`)
      }
    }

    if (drifted.length) {
      console.log('\n❌ Sequence drift — the next app insert into these tables WILL fail:')
      for (const d of drifted) console.log(`   ${d}`)
      if (fix) {
        console.log('\n🔢 Repairing sequences...')
        await resyncSequences(target, allTables, schema, (m) => console.log(m))
        console.log('   Sequences repaired.')
      } else {
        problems += drifted.length
        console.log('   Re-run with --fix to repair.')
      }
    } else {
      console.log('✅ Sequences: all ahead of their max id.')
    }

    // 4. Orphaned pool families — legal at the DB level, wrong in the app.
    if (schema.tables.has('card_pools')) {
      const { rows } = await target.query(
        `SELECT COUNT(*)::int AS n FROM card_pools c
         WHERE c.parent_pool_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM card_pools p WHERE p.id = c.parent_pool_id)`
      )
      if (rows[0].n > 0) {
        problems += 1
        console.log(`\n❌ ${rows[0].n} build(s) whose parent pool is missing.`)
        console.log('   These detach from their pool and render as their own root.')
        console.log('   Fix by copying the parent: npm run copy-pool -- <parent shareId>')
      } else {
        console.log('✅ Pool families: every build has its parent.')
      }

      // Pools whose owner is gone — user_id is ON DELETE CASCADE so this should
      // be impossible, but a triggers-disabled restore can produce it.
      const { rows: noOwner } = await target.query(
        `SELECT COUNT(*)::int AS n FROM card_pools c
         WHERE c.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id)`
      )
      if (noOwner[0].n > 0) {
        problems += 1
        console.log(`\n❌ ${noOwner[0].n} pool(s) whose owner user row is missing.`)
        console.log('   These render as "Anonymous" and break ownership/delete gating.')
        console.log('   Fix by copying the owner: npm run copy-user-to-dev -- <username>')
      }
    }

    console.log(
      problems === 0
        ? '\n✅ Dev database looks healthy.\n'
        : `\n⚠️  ${problems} issue group(s) found. See above.\n`
    )
    if (problems > 0 && !fix) process.exitCode = 1
  } catch (err: any) {
    console.error('Verify failed:', err.message)
    process.exitCode = 1
  } finally {
    await target.end().catch(() => {})
  }
}

main()
