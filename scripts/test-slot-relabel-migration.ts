#!/usr/bin/env npx tsx
/**
 * Verifies migration 122 (relabel Set 7+ and Icons slot types) against a scratch
 * local Postgres database. Never touches dev or prod data.
 *
 * Seeds card_generations with REAL generated packs, labelled the way production
 * labelled them before the fix (Sets 1-6 position map) and after it
 * (slotTypeForPackCard), then runs the migration twice and checks that every row
 * ends with the label the live tracker writes today.
 *
 *   SLOT_RELABEL_TEST_ADMIN_URL=postgresql://localhost/postgres npx tsx scripts/test-slot-relabel-migration.ts
 *
 * The admin URL (default postgresql://localhost/postgres) must be able to CREATE
 * DATABASE; a throwaway database is created and dropped.
 */
import pg from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initializeCardCache } from '../src/utils/cardCache'
import { generateBoosterPack, clearBeltCache } from '../src/utils/boosterPack'
import { PACK_SLOT_TYPES, slotTypeForPackCard } from '../src/utils/packSlotTypes'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ADMIN_URL = process.env.SLOT_RELABEL_TEST_ADMIN_URL || 'postgresql://localhost/postgres'
const DB = `slot_relabel_test_${process.pid}`
const migrationSql = readFileSync(join(root, 'migrations/122_relabel_set7plus_and_icons_slot_types.sql'), 'utf8')

const SCHEMA = `
CREATE TABLE card_generations (
  id SERIAL PRIMARY KEY, card_id TEXT NOT NULL, set_code VARCHAR(10) NOT NULL,
  card_type VARCHAR(50) NOT NULL, rarity VARCHAR(20) NOT NULL, is_foil BOOLEAN DEFAULT FALSE,
  pack_type VARCHAR(50) NOT NULL, slot_type VARCHAR(50), source_type VARCHAR(50) NOT NULL,
  source_id INTEGER NOT NULL, pack_index INTEGER, expected VARCHAR(50));
CREATE TABLE stat_cache (key TEXT PRIMARY KEY, payload JSONB NOT NULL, computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`

type Row = [string, string, string, string, boolean, string | null, string, number, number | null, string | null]

let failures = 0
function check(ok: boolean, msg: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failures++
}

async function main() {
  await initializeCardCache()
  clearBeltCache()

  const rows: Row[] = []
  let sourceId = 1
  // A pool = one source with several packs. `labelling` is how prod tagged it.
  const addPool = (setCode: string, packs: number, labelling: 'old' | 'new', sourceType = 'sealed') => {
    const id = sourceId++
    for (let p = 0; p < packs; p++) {
      const cards = generateBoosterPack([], setCode).cards
      cards.forEach((card, i) => {
        const now = slotTypeForPackCard(card, i, setCode)
        const tagged = labelling === 'old' ? (PACK_SLOT_TYPES[i] ?? null) : now
        rows.push([card.id, card.set, card.type, card.rarity, card.isFoil === true, tagged, sourceType, id, p, now])
      })
    }
  }

  for (const set of ['LAW', 'ASH', 'HMW']) {
    addPool(set, 6, 'old')
    addPool(set, 6, 'old', 'draft')
    addPool(set, 6, 'new')
    if (set !== 'HMW') addPool(`${set}-CB`, 3, 'old') // carbonite: same labels before and after the fix (none for HMW)
  }
  addPool('IC27', 24, 'old')
  addPool('IC27', 6, 'new')
  addPool('SOR', 6, 'old')
  addPool('TWI', 6, 'new')

  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${DB}`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${DB}`
  const db = new pg.Client({ connectionString: url.toString() })
  try {
    await db.connect()
    await db.query(SCHEMA)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const values = chunk.flat()
      const ph = chunk.map((_, r) => `(${Array.from({ length: 10 }, (_, c) => `$${r * 10 + c + 1}`).join(',')}, 'booster')`).join(',')
      await db.query(`INSERT INTO card_generations (card_id,set_code,card_type,rarity,is_foil,slot_type,source_type,source_id,pack_index,expected,pack_type) VALUES ${ph}`, values)
    }
    // A row with no pack position must be left alone.
    await db.query(`INSERT INTO card_generations (card_id,set_code,card_type,rarity,is_foil,slot_type,source_type,source_id,pack_index,expected,pack_type)
                    VALUES ('LAW_X','LAW','Unit','Rare',false,'foil','sealed',999,NULL,'foil','booster')`)
    await db.query(`INSERT INTO stat_cache (key,payload) VALUES ('pack-quality:LAW:2026-02-12','{}'),('pack-quality:SOR:2026-02-12','{}'),('generations:IC27:2026-02-12','{}')`)

    const before = await db.query(`SELECT count(*)::int n FROM card_generations WHERE slot_type IS DISTINCT FROM expected`)
    check(before.rows[0].n > 0, `seeded ${rows.length} rows, ${before.rows[0].n} mislabelled before the migration`)

    await db.query(migrationSql)
    const wrong = await db.query(`SELECT set_code, slot_type, expected, count(*)::int n FROM card_generations
                                  WHERE slot_type IS DISTINCT FROM expected GROUP BY 1,2,3 ORDER BY 1,2,3`)
    if (wrong.rows.length) console.table(wrong.rows)
    check(wrong.rows.length === 0, 'every row carries the live tracker\'s label after the migration')

    const snapshot = await db.query(`SELECT id, slot_type FROM card_generations ORDER BY id`)
    await db.query(migrationSql)
    const again = await db.query(`SELECT id, slot_type FROM card_generations ORDER BY id`)
    check(JSON.stringify(snapshot.rows) === JSON.stringify(again.rows), 're-running the migration changes nothing')

    const stale = await db.query(`SELECT key, computed_at = 'epoch' AS stale FROM stat_cache ORDER BY key`)
    const byKey = Object.fromEntries(stale.rows.map(r => [r.key, r.stale]))
    check(byKey['pack-quality:LAW:2026-02-12'] && byKey['generations:IC27:2026-02-12'] && !byKey['pack-quality:SOR:2026-02-12'],
      'only the affected sets\' stored stats are marked stale')
  } finally {
    await db.end().catch(() => {})
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`)
    await admin.end()
  }
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('All checks passed')
}

main().catch(e => { console.error(e); process.exit(1) })
