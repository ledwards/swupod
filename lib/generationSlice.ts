// One pass over card_generations per stat computation, instead of one per query.
//
// The QA stats (generations + pack quality) run ~30 aggregates that all filter
// card_generations on the same (set_code, generated_at >= since). That table is
// 15M+ wide rows, so each query re-read a third of it and spilled its sort to
// disk; on a 3 GB database that thrashed for ten minutes and slowed every other
// query (2026-11-21). Here the matching rows are copied once, narrow, into a
// transaction-local temp table, and every aggregate runs against that copy.
import { withTransaction, type TxClient } from '@/lib/db'

/** Name of the temp table the stat queries read. */
export const GENERATION_SLICE = 'gen_slice'

// Only the columns the stat queries use. set_code and generated_at stay so the
// queries keep their original WHERE clauses and parameters unchanged.
const SLICE_COLUMNS = [
  'card_id', 'set_code', 'card_name', 'card_subtitle', 'card_type', 'rarity',
  'aspects', 'treatment', 'slot_type', 'source_type', 'source_id', 'pack_index',
  'generated_at',
].join(', ')

// The stats measure standard booster collation. Carbonite packs hold the same set's
// cards in an all-variant layout with no base, so their rows ('carbonite_*' slot
// types, see src/utils/packSlotTypes) would fail every per-pack check and skew the
// treatment rates; they are left out of the slice.
const CARBONITE_ROWS = 'carbonite\\_%'

// One slice at a time, process-wide: two at once is what the database cannot hold.
let queue: Promise<unknown> = Promise.resolve()

export function withGenerationSlice<T>(
  setCode: string,
  since: string,
  fn: (db: TxClient) => Promise<T>,
  run: typeof withTransaction = withTransaction,
): Promise<T> {
  const result = queue.then(() => run(async (db) => {
    // Sorts and hash aggregates over the slice stay in memory; one query runs at a
    // time on this connection, so this is not multiplied by concurrency.
    await db.query(`SET LOCAL work_mem = '128MB'`)
    await db.query(`SET LOCAL max_parallel_workers_per_gather = 0`)
    await db.query(
      `CREATE TEMP TABLE ${GENERATION_SLICE} ON COMMIT DROP AS
       SELECT ${SLICE_COLUMNS} FROM card_generations WITH NO DATA`
    )
    await db.query(
      `INSERT INTO ${GENERATION_SLICE} (${SLICE_COLUMNS})
       SELECT ${SLICE_COLUMNS} FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
         AND (slot_type IS NULL OR slot_type NOT LIKE '${CARBONITE_ROWS}')`,
      [setCode, since]
    )
    await db.query(`ANALYZE ${GENERATION_SLICE}`)
    return fn(db)
  }))
  queue = result.catch(() => undefined)
  return result
}
