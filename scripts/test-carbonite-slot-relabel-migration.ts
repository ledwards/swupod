#!/usr/bin/env npx tsx
/**
 * Verifies migration 123 (relabel Carbonite slot types) against a scratch local
 * Postgres database. Never touches dev or prod data.
 *
 * Seeds card_generations with REAL generated Carbonite and standard packs, labelled
 * the way production labelled them before the fix (Sets 1-6 position map) and after
 * it (slotTypeForPackCard), plus ASH Carbonite packs in the LAW layout ASH printed
 * before 2026-07-10. Runs the migration twice and checks every row ends with the
 * label of the layout that printed it, and standard packs are untouched.
 *
 *   SLOT_RELABEL_TEST_ADMIN_URL=postgresql://localhost/postgres npx tsx scripts/test-carbonite-slot-relabel-migration.ts
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
import { PACK_SLOT_TYPES, CARBONITE_LAW_SLOT_TYPES, slotTypeForPackCard } from '../src/utils/packSlotTypes'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ADMIN_URL = process.env.SLOT_RELABEL_TEST_ADMIN_URL || 'postgresql://localhost/postgres'
const DB = `cb_slot_relabel_test_${process.pid}`
const migrationSql = readFileSync(join(root, 'migrations/123_relabel_carbonite_slot_types.sql'), 'utf8')

const SCHEMA = `
CREATE TABLE card_generations (
  id SERIAL PRIMARY KEY, card_id TEXT NOT NULL, set_code VARCHAR(10) NOT NULL,
  card_type VARCHAR(50) NOT NULL, rarity VARCHAR(20) NOT NULL, is_foil BOOLEAN DEFAULT FALSE,
  pack_type VARCHAR(50) NOT NULL, variant_type VARCHAR(50), slot_type VARCHAR(50), source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL, pack_index INTEGER, expected VARCHAR(50));
CREATE TABLE stat_cache (key TEXT PRIMARY KEY, payload JSONB NOT NULL, computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`

type Row = [string, string, string, string, boolean, string, string | null, string, string, number | null, string | null]

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
  const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  // A pool = one source with several packs. `labelling` is how prod tagged it.
  const addPool = (setCode: string, packs: number, labelling: 'old' | 'new', sourceType = 'sealed',
                   rewrite?: { set: string; expected: (i: number) => string }) => {
    const id = uuid(sourceId++)
    for (let p = 0; p < packs; p++) {
      const cards = generateBoosterPack([], setCode).cards
      cards.forEach((card, i) => {
        const set = rewrite?.set ?? card.set
        const now = rewrite ? rewrite.expected(i) : slotTypeForPackCard(card, i, setCode)
        const tagged = labelling === 'old' ? (PACK_SLOT_TYPES[i] ?? null) : now
        rows.push([card.id, set, card.type, card.rarity, card.isFoil === true, card.variantType ?? 'Normal', tagged, sourceType, id, p, now])
      })
    }
  }

  for (const set of ['JTL', 'LOF', 'SEC', 'LAW', 'ASH']) {
    addPool(`${set}-CB`, 6, 'old')
    addPool(`${set}-CB`, 4, 'old', 'draft')
    addPool(`${set}-CB`, 3, 'new')
    addPool(set, 40, 'new') // standard packs: LAW+ ones can hold a prestige UC3, and must stay as they are
  }
  // ASH Carbonite before 2026-07-10 printed the LAW layout (prestige at index 1)
  addPool('LAW-CB', 4, 'old', 'sealed', { set: 'ASH', expected: i => CARBONITE_LAW_SLOT_TYPES[i] })
  addPool('HMW', 6, 'new')
  addPool('SOR', 6, 'new')

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
      const ph = chunk.map((_, r) => `(${Array.from({ length: 11 }, (_, c) => `$${r * 11 + c + 1}`).join(',')}, 'booster')`).join(',')
      await db.query(`INSERT INTO card_generations (card_id,set_code,card_type,rarity,is_foil,variant_type,slot_type,source_type,source_id,pack_index,expected,pack_type) VALUES ${ph}`, values)
    }
    const prestigeStandard = await db.query(`SELECT count(DISTINCT (source_id, pack_index))::int n FROM card_generations
      WHERE variant_type LIKE '%Prestige' AND expected NOT LIKE 'carbonite%'`)
    console.log(`      ${prestigeStandard.rows[0].n} standard packs hold a prestige UC3 (must be left alone)`)
    await db.query(`INSERT INTO stat_cache (key,payload) VALUES ('pack-quality:LAW:2026-02-12','{}'),('pack-quality:SOR:2026-02-12','{}'),('generations:JTL:2026-02-12','{}')`)

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
    check(byKey['pack-quality:LAW:2026-02-12'] && byKey['generations:JTL:2026-02-12'] && !byKey['pack-quality:SOR:2026-02-12'],
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
