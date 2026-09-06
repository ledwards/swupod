/**
 * Migration 095: Backfill card_generations tracking for Pack Wars and Pack Blitz pools.
 *
 * BACKGROUND
 * ==========
 * The same gap migration 094 closed for Chaos Sealed: `/api/formats/pack-wars` and
 * `/api/formats/pack-blitz` generated boosters, inserted the pool and returned
 * without ever calling the tracker. Nothing opened in either format reached the
 * Showcases page or the pack statistics.
 *
 * Both routes now track live. This backfills the pools created before that.
 *
 * WHAT IT DOES
 * ============
 * Reads each pool's stored `packs` JSON and writes the same `card_generations` rows
 * the routes now write, via the shared builder in
 * `src/services/boosterPoolTracking.ts` — the live path and this backfill share one
 * implementation so they cannot drift.
 *
 * These pools store the raw pack objects (`{cards: [...]}`) with no per-pack setCode,
 * which the shared builder already handles.
 *
 * SAFETY / IDEMPOTENCY
 * ====================
 * - Pools that already have any `card_generations` row are skipped, so re-running is
 *   a no-op and an interrupted run resumes where it stopped.
 * - Each pool's rows are written in one transaction, so a pool is either fully
 *   tracked or not tracked at all. Without that, an interrupted pool would be
 *   skipped as "already tracked" on the next run and stay permanently incomplete.
 * - Per-pool work is isolated: one malformed pool is logged and skipped, never
 *   aborting the run.
 * - Insert-only. No existing row is modified or deleted.
 *
 * The row-shaping helpers below are duplicated from migration 094 on purpose: an
 * applied migration is a historical record of what ran, so it is not refactored into
 * a shared helper after the fact.
 */
import { buildBoosterPoolTrackingRecords } from '../src/services/boosterPoolTracking.ts'

const POOL_TYPES = ['pack_wars', 'pack_blitz']
const PROGRESS_EVERY = 250
const INSERT_BATCH_SIZE = 100

const INSERT_SQL_PREFIX = `INSERT INTO card_generations (
  card_id, set_code, card_name, card_subtitle, card_type, rarity, aspects,
  treatment, variant_type, is_foil, is_hyperspace, is_showcase,
  pack_type, slot_type, source_type, source_id, source_share_id, pack_index, user_id
) VALUES `

/** Treatment, matching src/utils/trackGeneration.ts determineTreatment(). */
function determineTreatment(card) {
  const isHyperspace = card.isHyperspace === true || card.variantType === 'Hyperspace'
  if (card.variantType === 'Showcase') return 'showcase'
  if (isHyperspace && card.isFoil) return 'hyperspace_foil'
  if (card.isFoil) return 'foil'
  if (isHyperspace) return 'hyperspace'
  return 'base'
}

/** Slot type fallback, matching src/utils/trackGeneration.ts determineSlotType(). */
function determineSlotType(card) {
  if (card.isLeader) return 'leader'
  if (card.isBase) return 'base'
  if (card.isFoil) return 'foil'
  if (card.rarity === 'Common') return 'common'
  if (card.rarity === 'Uncommon') return 'uncommon'
  if (card.rarity === 'Rare' || card.rarity === 'Legendary') return 'rare_legendary'
  return 'unknown'
}

/** One record's 19 column values, in the order of INSERT_SQL_PREFIX. */
function rowValues(record, fallbackSetCode) {
  const { card, options } = record
  const isHyperspace = card.isHyperspace === true || card.variantType === 'Hyperspace'
  return [
    card.id,
    card.set || fallbackSetCode,
    card.name,
    card.subtitle || null,
    card.type,
    card.rarity,
    card.aspects || [],
    determineTreatment(card),
    card.variantType,
    card.isFoil || false,
    isHyperspace,
    card.variantType === 'Showcase',
    options.packType,
    options.slotType || determineSlotType(card),
    options.sourceType,
    options.sourceId,
    options.sourceShareId,
    options.packIndex,
    options.userId,
  ]
}

function parsePacks(packs) {
  if (packs === null || packs === undefined) return null
  if (Array.isArray(packs)) return packs
  if (typeof packs === 'string') {
    try { return JSON.parse(packs) } catch { return null }
  }
  return null
}

export async function run(client) {
  console.log('   Backfill card_generations for Pack Wars / Pack Blitz pools')

  const poolsResult = await client.query(`
    SELECT id
    FROM card_pools
    WHERE pool_type = ANY($1)
      AND packs IS NOT NULL
    ORDER BY created_at ASC
  `, [POOL_TYPES])

  const poolIds = poolsResult.rows.map(r => r.id)
  console.log(`   Found ${poolIds.length} Pack Wars / Pack Blitz pools to check`)

  let processed = 0
  let skipped = 0
  let failed = 0
  let cardsInserted = 0
  let showcaseLeaders = 0

  for (const [index, poolId] of poolIds.entries()) {
    if (index > 0 && index % PROGRESS_EVERY === 0) {
      console.log(`   ...${index}/${poolIds.length} pools checked (${cardsInserted} cards inserted so far)`)
    }

    try {
      const existing = await client.query(
        'SELECT 1 FROM card_generations WHERE source_id = $1 LIMIT 1',
        [poolId]
      )
      if (existing.rows.length > 0) {
        skipped++
        continue
      }

      const poolRow = await client.query(
        'SELECT id, share_id, user_id, set_code, packs FROM card_pools WHERE id = $1',
        [poolId]
      )
      if (poolRow.rows.length === 0) {
        skipped++
        continue
      }

      const { share_id, user_id, set_code, packs } = poolRow.rows[0]
      const parsedPacks = parsePacks(packs)
      if (!parsedPacks) {
        console.log(`   Pool ${share_id}: unreadable packs JSON, skipping`)
        skipped++
        continue
      }

      const records = buildBoosterPoolTrackingRecords(parsedPacks, {
        poolId,
        shareId: share_id,
        userId: user_id,
      })

      if (records.length === 0) {
        skipped++
        continue
      }

      // These formats are single-set, so the pool's own set_code is a usable fallback
      // for a card that somehow lacks its own.
      const fallbackSetCode = typeof set_code === 'string' ? set_code.split(',')[0] : null

      await client.query('BEGIN')
      try {
        for (let i = 0; i < records.length; i += INSERT_BATCH_SIZE) {
          const batch = records.slice(i, i + INSERT_BATCH_SIZE)
          const placeholders = batch.map((_, idx) => {
            const base = idx * 19
            const params = Array.from({ length: 19 }, (_, n) => `$${base + n + 1}`)
            return `(${params.join(', ')})`
          }).join(', ')

          const values = batch.flatMap(record => rowValues(record, fallbackSetCode))
          await client.query(INSERT_SQL_PREFIX + placeholders, values)
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }

      const poolShowcaseLeaders = records.filter(
        r => r.card.variantType === 'Showcase' && r.options.slotType === 'leader'
      ).length

      processed++
      cardsInserted += records.length
      showcaseLeaders += poolShowcaseLeaders
    } catch (error) {
      failed++
      console.log(`   Pool ${poolId}: failed (${error.message}), skipping`)
    }
  }

  console.log(`   Summary: ${processed} pools backfilled, ${skipped} skipped, ${failed} failed`)
  console.log(`   Total: ${cardsInserted} cards inserted, ${showcaseLeaders} showcase leaders restored`)
}
