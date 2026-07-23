// @ts-nocheck
//
// Shared engine for every prod -> dev copy script.
//
// The point of this module is that a copy script should only have to say WHICH
// rows it cares about ("this pool family", "this user's pods"). Everything that
// makes the copy referentially correct is derived from the target database's
// own catalog, so a new migration cannot silently rot a copy script:
//
//   - FK CLOSURE. Every row a seed row points at is pulled in automatically,
//     transitively. This is what stops `draft_picks.user_id`, `built_decks.
//     user_id`, `casual_matches.user_id` and `practice_matches.round_id` from
//     landing as FK violations that get swallowed by a per-row catch.
//   - INSERT ORDER. Tables are topologically sorted by their FK graph, and any
//     self-referencing table (card_pools.parent_pool_id) is inserted
//     parent-first within itself.
//   - CONFLICTS. `ON CONFLICT DO NOTHING` with NO conflict target, so it
//     absorbs EVERY unique constraint (built_decks.card_pool_id,
//     pool_views(user_id,pool_id), the casual_matches partial index, ...),
//     not just the primary key.
//   - SEQUENCES. Tables with SERIAL ids (card_generations, draft_picks) get
//     their sequence advanced past the copied ids, so the next insert the app
//     makes locally doesn't collide.
//   - VERIFICATION. After copying, every FK in the touched tables is checked
//     for dangling references, and the result is reported.
//
// Copies are INSERT-only and idempotent: re-running tops up, never clobbers.

import pg from 'pg'

export interface ForeignKey {
  table: string
  column: string
  refTable: string
  refColumn: string
}

export interface TableInfo {
  columns: Set<string>
  /** json/jsonb columns — pg returns these parsed, so they must be re-stringified. */
  jsonColumns: Set<string>
  primaryKey: string[]
}

export interface Schema {
  tables: Map<string, TableInfo>
  /** Outbound FKs, keyed by the child table. */
  foreignKeys: Map<string, ForeignKey[]>
}

/**
 * Read columns, primary keys and foreign keys from a live database.
 *
 * FKs come from pg_catalog rather than information_schema because
 * information_schema.constraint_column_usage reports the wrong pairing for
 * composite foreign keys; unnesting conkey/confkey together is correct for
 * both single-column and composite FKs.
 */
export async function introspectSchema(pool: pg.Pool): Promise<Schema> {
  const { rows: colRows } = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  )

  const { rows: pkRows } = await pool.query(
    `SELECT con.conrelid::regclass::text AS table_name, att.attname AS column_name
     FROM pg_constraint con
     JOIN pg_namespace n ON n.oid = con.connamespace
     CROSS JOIN LATERAL unnest(con.conkey) AS u(attnum)
     JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
     WHERE con.contype = 'p' AND n.nspname = 'public'`
  )

  const { rows: fkRows } = await pool.query(
    `SELECT con.conrelid::regclass::text AS table_name,
            att.attname                  AS column_name,
            con.confrelid::regclass::text AS ref_table,
            fatt.attname                 AS ref_column
     FROM pg_constraint con
     JOIN pg_namespace n ON n.oid = con.connamespace
     CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS u(conkey, confkey)
     JOIN pg_attribute att  ON att.attrelid  = con.conrelid  AND att.attnum  = u.conkey
     JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = u.confkey
     WHERE con.contype = 'f' AND n.nspname = 'public'`
  )

  const tables = new Map<string, TableInfo>()
  for (const r of colRows as any[]) {
    let info = tables.get(r.table_name)
    if (!info) {
      info = { columns: new Set(), jsonColumns: new Set(), primaryKey: [] }
      tables.set(r.table_name, info)
    }
    info.columns.add(r.column_name)
    if (r.data_type === 'json' || r.data_type === 'jsonb') info.jsonColumns.add(r.column_name)
  }
  for (const r of pkRows as any[]) {
    // regclass renders as "public.foo" only when it isn't on search_path; strip defensively.
    const t = r.table_name.replace(/^public\./, '')
    tables.get(t)?.primaryKey.push(r.column_name)
  }

  const foreignKeys = new Map<string, ForeignKey[]>()
  for (const r of fkRows as any[]) {
    const table = r.table_name.replace(/^public\./, '')
    const refTable = r.ref_table.replace(/^public\./, '')
    const fk: ForeignKey = { table, column: r.column_name, refTable, refColumn: r.ref_column }
    const list = foreignKeys.get(table)
    if (list) list.push(fk)
    else foreignKeys.set(table, [fk])
  }

  return { tables, foreignKeys }
}

/**
 * Order tables so that every table comes after the tables it references.
 * Self-references are ignored here (handled row-level by insertRows).
 * A cycle between two different tables is broken arbitrarily and reported,
 * rather than throwing — a partial copy beats no copy.
 */
export function topologicalOrder(tables: string[], schema: Schema): { order: string[]; cycles: string[] } {
  const set = new Set(tables)
  const deps = new Map<string, Set<string>>()
  for (const t of tables) {
    const d = new Set<string>()
    for (const fk of schema.foreignKeys.get(t) || []) {
      if (fk.refTable !== t && set.has(fk.refTable)) d.add(fk.refTable)
    }
    deps.set(t, d)
  }

  const order: string[] = []
  const done = new Set<string>()
  const cycles: string[] = []
  let remaining = [...tables]
  while (remaining.length) {
    const ready = remaining.filter((t) => [...(deps.get(t) || [])].every((d) => done.has(d)))
    if (ready.length === 0) {
      // Cycle — take the one with the fewest unmet deps and move on.
      const next = remaining
        .slice()
        .sort((a, b) => (deps.get(a)?.size || 0) - (deps.get(b)?.size || 0))[0]
      cycles.push(next)
      order.push(next)
      done.add(next)
      remaining = remaining.filter((t) => t !== next)
      continue
    }
    for (const t of ready) {
      order.push(t)
      done.add(t)
    }
    remaining = remaining.filter((t) => !done.has(t))
  }
  return { order, cycles }
}

function primaryKeyOf(schema: Schema, table: string): string | null {
  const pk = schema.tables.get(table)?.primaryKey
  return pk && pk.length === 1 ? pk[0] : null
}

/**
 * Walk outbound FKs from the seed rows and pull in every referenced parent row
 * from the source, transitively, until nothing new is needed.
 *
 * Only parents are followed, never children, so the closure is bounded by the
 * FK depth of the schema rather than by table size.
 */
export async function expandForeignKeyClosure(
  source: pg.Pool,
  schema: Schema,
  seeds: Map<string, any[]>,
  log: (msg: string) => void = () => {}
): Promise<Map<string, any[]>> {
  const collected = new Map<string, Map<any, any>>()
  const seenKeys = new Map<string, Set<any>>()

  const keyOf = (table: string, row: any) => {
    const pk = primaryKeyOf(schema, table)
    return pk ? row[pk] : JSON.stringify(row)
  }

  let frontier: Array<{ table: string; rows: any[] }> = []
  for (const [table, rows] of seeds) {
    if (!schema.tables.has(table)) {
      log(`  ! skipping unknown table "${table}" (not in target schema)`)
      continue
    }
    frontier.push({ table, rows })
  }

  for (const { table, rows } of frontier) {
    let bucket = collected.get(table)
    if (!bucket) { bucket = new Map(); collected.set(table, bucket) }
    for (const row of rows) bucket.set(keyOf(table, row), row)
  }

  let pending = frontier
  let depth = 0
  while (pending.length) {
    depth++
    if (depth > 20) {
      log('  ! FK closure exceeded depth 20 — stopping (possible schema cycle)')
      break
    }

    // Which parent ids do the rows we just added require?
    const wanted = new Map<string, Set<any>>()
    for (const { table, rows } of pending) {
      for (const fk of schema.foreignKeys.get(table) || []) {
        const refPk = primaryKeyOf(schema, fk.refTable)
        // Only chase FKs that point at a single-column key we can select on.
        if (!refPk && fk.refColumn == null) continue
        for (const row of rows) {
          const v = row[fk.column]
          if (v === null || v === undefined) continue
          // Already have it?
          if (collected.get(fk.refTable)?.has(v)) continue
          let s = wanted.get(`${fk.refTable}.${fk.refColumn}`)
          if (!s) { s = new Set(); wanted.set(`${fk.refTable}.${fk.refColumn}`, s) }
          s.add(v)
        }
      }
    }

    const next: Array<{ table: string; rows: any[] }> = []
    for (const [tableCol, values] of wanted) {
      const idx = tableCol.lastIndexOf('.')
      const refTable = tableCol.slice(0, idx)
      const refColumn = tableCol.slice(idx + 1)

      let seen = seenKeys.get(tableCol)
      if (!seen) { seen = new Set(); seenKeys.set(tableCol, seen) }
      const toFetch = [...values].filter((v) => !seen.has(v))
      if (toFetch.length === 0) continue
      for (const v of toFetch) seen.add(v)

      const { rows } = await source.query(
        `SELECT * FROM ${refTable} WHERE "${refColumn}" = ANY($1)`,
        [toFetch]
      )
      if (rows.length === 0) continue

      let bucket = collected.get(refTable)
      if (!bucket) { bucket = new Map(); collected.set(refTable, bucket) }
      const added: any[] = []
      for (const row of rows) {
        const k = keyOf(refTable, row)
        if (bucket.has(k)) continue
        bucket.set(k, row)
        added.push(row)
      }
      if (added.length) {
        log(`  + pulled ${added.length} ${refTable} row(s) via FK closure`)
        next.push({ table: refTable, rows: added })
      }
    }
    pending = next
  }

  const out = new Map<string, any[]>()
  for (const [table, bucket] of collected) out.set(table, [...bucket.values()])
  return out
}

/**
 * Insert rows into one table.
 *
 * `ON CONFLICT DO NOTHING` carries no conflict target on purpose: that form
 * absorbs a violation of ANY unique constraint or unique index (including
 * partial ones), which `ON CONFLICT (id)` does not. A row already present
 * under a different id is therefore skipped quietly instead of raising and
 * being swallowed by an error handler.
 */
export async function insertRows(
  target: pg.Pool,
  table: string,
  rows: any[],
  schema: Schema,
  onError: (table: string, message: string) => void
): Promise<number> {
  const info = schema.tables.get(table)
  if (!info) return 0

  let inserted = 0
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => info.columns.has(c))
    if (cols.length === 0) continue
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const values = cols.map((c) => {
      const v = row[c]
      // json/jsonb must be re-stringified; native arrays (text[]/uuid[]) must NOT be.
      if (v !== null && info.jsonColumns.has(c) && typeof v === 'object') return JSON.stringify(v)
      return v
    })
    try {
      const res = await target.query(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')})
         VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        values
      )
      inserted += res.rowCount || 0
    } catch (e: any) {
      onError(table, e.message)
    }
  }
  return inserted
}

/**
 * Insert a self-referencing table parent-first, so a row never lands before the
 * row its own FK points at (card_pools.parent_pool_id).
 */
async function insertSelfReferencing(
  target: pg.Pool,
  table: string,
  rows: any[],
  schema: Schema,
  selfColumns: string[],
  onError: (table: string, message: string) => void
): Promise<number> {
  const pk = primaryKeyOf(schema, table)
  if (!pk) return insertRows(target, table, rows, schema, onError)

  const placed = new Set<any>()
  let remaining = [...rows]
  let inserted = 0
  let progress = true
  while (remaining.length && progress) {
    progress = false
    const next: any[] = []
    for (const row of remaining) {
      const ready = selfColumns.every((c) => {
        const v = row[c]
        return v === null || v === undefined || v === row[pk] || placed.has(v)
      })
      if (ready) {
        inserted += await insertRows(target, table, [row], schema, onError)
        placed.add(row[pk])
        progress = true
      } else {
        next.push(row)
      }
    }
    remaining = next
  }
  // Anything left points at a parent outside this copy — the FK is ON DELETE
  // SET NULL / nullable in every such case, so insert it and let the check below
  // report it if it really is dangling.
  if (remaining.length) inserted += await insertRows(target, table, remaining, schema, onError)
  return inserted
}

/**
 * Advance SERIAL/IDENTITY sequences past the ids we just copied.
 *
 * Copying explicit integer ids does not move the sequence, so without this the
 * app's next local insert into card_generations / draft_picks collides with a
 * copied row and fails until the sequence catches up.
 */
export async function resyncSequences(
  target: pg.Pool,
  tables: string[],
  schema: Schema,
  log: (msg: string) => void = () => {}
): Promise<string[]> {
  const fixed: string[] = []
  for (const table of tables) {
    const pk = primaryKeyOf(schema, table)
    if (!pk) continue
    const { rows } = await target.query(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [table, pk])
    const seq = rows[0]?.seq
    if (!seq) continue
    const { rows: r } = await target.query(
      `SELECT setval($1, GREATEST(COALESCE((SELECT MAX("${pk}") FROM ${table}), 0), 1), true) AS v`,
      [seq]
    )
    fixed.push(`${table}.${pk} -> ${r[0].v}`)
    log(`  ↻ sequence ${table}.${pk} set to ${r[0].v}`)
  }
  return fixed
}

export interface DanglingReport {
  table: string
  column: string
  refTable: string
  refColumn: string
  count: number
  /** Human label for the report line — differs from `column` for polymorphic refs. */
  label: string
  /**
   * Extra WHERE predicate that scopes the check (polymorphic refs only).
   * MUST be carried into any generated DELETE: without it, a delete aimed at
   * source_type='sealed' rows would also match the 'draft' rows, whose
   * source_id legitimately points at pods rather than card_pools.
   */
  predicate: string | null
}

/** Build the (reviewed-by-a-human) DELETE that would clear one dangling group. */
export function danglingDeleteSql(d: DanglingReport): string {
  const scope = d.predicate ? `\n     AND ${d.predicate.replace(/\bg\./g, 'c.')}` : ''
  return (
    `DELETE FROM ${d.table} c\n` +
    `   WHERE c."${d.column}" IS NOT NULL${scope}\n` +
    `     AND NOT EXISTS (SELECT 1 FROM ${d.refTable} p WHERE p."${d.refColumn}" = c."${d.column}");`
  )
}

/**
 * After a copy, check every FK on the touched tables for rows pointing at a
 * parent that isn't there. With FK constraints enforced this should always be
 * empty; it is a guard against a future copy running with constraints disabled,
 * and it is the only way to catch POLYMORPHIC references, which have no FK at
 * all (card_generations.source_id -> card_pools.id | pods.id by source_type).
 */
export async function verifyIntegrity(
  target: pg.Pool,
  tables: string[],
  schema: Schema
): Promise<DanglingReport[]> {
  const reports: DanglingReport[] = []

  for (const table of tables) {
    for (const fk of schema.foreignKeys.get(table) || []) {
      const { rows } = await target.query(
        `SELECT COUNT(*)::int AS n
         FROM ${fk.table} c
         LEFT JOIN ${fk.refTable} p ON p."${fk.refColumn}" = c."${fk.column}"
         WHERE c."${fk.column}" IS NOT NULL AND p."${fk.refColumn}" IS NULL`
      )
      if (rows[0].n > 0) {
        reports.push({
          table: fk.table,
          column: fk.column,
          refTable: fk.refTable,
          refColumn: fk.refColumn,
          count: rows[0].n,
          label: fk.column,
          predicate: null,
        })
      }
    }
  }

  // Polymorphic: card_generations.source_id has NO foreign key, so a generation
  // can outlive the pool/pod it describes and nothing at the DB level notices.
  if (tables.includes('card_generations') && schema.tables.has('card_generations')) {
    for (const [sourceType, refTable] of [['sealed', 'card_pools'], ['draft', 'pods']] as const) {
      const { rows } = await target.query(
        `SELECT COUNT(*)::int AS n
         FROM card_generations g
         LEFT JOIN ${refTable} p ON p.id = g.source_id
         WHERE g.source_type = $1 AND g.source_id IS NOT NULL AND p.id IS NULL`,
        [sourceType]
      )
      if (rows[0].n > 0) {
        reports.push({
          table: 'card_generations',
          column: 'source_id',
          refTable,
          refColumn: 'id',
          count: rows[0].n,
          label: `source_id (source_type='${sourceType}')`,
          predicate: `source_type = '${sourceType}'`,
        })
      }
    }
  }

  return reports
}

export interface CopyResult {
  counts: Record<string, number>
  order: string[]
  cycles: string[]
  sequences: string[]
  dangling: DanglingReport[]
  errors: Array<{ table: string; message: string }>
  /** Every row the closure resolved, keyed by table — the denominator in the report. */
  rows: Map<string, any[]>
}

/**
 * The whole pipeline: closure -> topological insert -> sequence resync ->
 * integrity verification. Copy scripts supply seeds and get a report back.
 */
export async function copyClosure(opts: {
  source: pg.Pool
  target: pg.Pool
  schema: Schema
  seeds: Map<string, any[]>
  log?: (msg: string) => void
}): Promise<CopyResult> {
  const { source, target, schema, seeds } = opts
  const log = opts.log || (() => {})

  log('\n🔗 Resolving foreign-key closure...')
  const all = await expandForeignKeyClosure(source, schema, seeds, log)

  const tables = [...all.keys()]
  const { order, cycles } = topologicalOrder(tables, schema)
  if (cycles.length) {
    log(`  ! FK cycle involving: ${cycles.join(', ')} — insert order may need a retry pass`)
  }
  log(`   insert order: ${order.join(' → ')}`)

  const errors: Array<{ table: string; message: string }> = []
  const seenErrors = new Set<string>()
  const onError = (table: string, message: string) => {
    const key = `${table}:${message}`
    if (seenErrors.has(key)) return
    seenErrors.add(key)
    errors.push({ table, message })
  }

  log('\n📥 Inserting...')
  const counts: Record<string, number> = {}
  for (const table of order) {
    const rows = all.get(table) || []
    const selfCols = (schema.foreignKeys.get(table) || [])
      .filter((fk) => fk.refTable === table)
      .map((fk) => fk.column)
    counts[table] = selfCols.length
      ? await insertSelfReferencing(target, table, rows, schema, selfCols, onError)
      : await insertRows(target, table, rows, schema, onError)
  }

  log('\n🔢 Re-syncing sequences...')
  const sequences = await resyncSequences(target, order, schema, log)

  log('\n🔍 Verifying referential integrity...')
  const dangling = await verifyIntegrity(target, order, schema)

  return { counts, order, cycles, sequences, dangling, errors, rows: all }
}

/** Standard end-of-run report, shared so every copy script prints the same thing. */
export function printReport(result: CopyResult): void {
  console.log('\n✅ Done. Inserted (new rows; already-present rows skipped):')
  for (const table of result.order) {
    const total = (result.rows.get(table) || []).length
    console.log(`   ${(table + ':').padEnd(20)} ${result.counts[table] ?? 0}/${total}`)
  }

  if (result.sequences.length) {
    console.log('\n🔢 Sequences advanced past copied ids:')
    for (const s of result.sequences) console.log(`   ${s}`)
  }

  if (result.errors.length) {
    console.log('\n⚠️  Row errors (deduped by message):')
    for (const e of result.errors) console.log(`   ${e.table}: ${e.message}`)
  }

  if (result.dangling.length) {
    console.log('\n❌ Dangling references found in the TARGET after copy:')
    for (const d of result.dangling) {
      console.log(`   ${d.table}.${d.label} -> ${d.refTable}: ${d.count} row(s) with no parent`)
    }
    console.log('   These rows will render as missing/unknown data in the app.')
  } else {
    console.log('\n🔍 Referential integrity: clean (no dangling references).')
  }
}
