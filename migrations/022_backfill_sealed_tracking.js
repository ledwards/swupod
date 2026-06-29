/**
 * Migration 022: Backfill card_generations tracking for sealed pools
 *
 * BACKGROUND
 * ==========
 * The card tracking code in /api/pools had a bug where it checked:
 *   if (Array.isArray(pack)) { ... }
 *
 * But packs from generateSealedPod() are objects: { cards: [...] }
 * not arrays. So the condition always failed and no tracking records
 * were created for sealed pools.
 *
 * This means showcase leaders from sealed pools weren't being tracked,
 * so users don't see them in their Showcases collection.
 *
 * WHAT THIS MIGRATION FIXES
 * =========================
 * - Reads the stored packs JSON from card_pools
 * - Creates card_generations tracking records for each card
 * - Properly attributes cards to the pool owner (user_id)
 * - Skips pools that already have tracking records
 *
 * SAFETY
 * ======
 * - Idempotent: Skips pools that already have tracking records
 * - Non-destructive: Only inserts new records, doesn't modify existing
 * - Handles both pack formats: array and {cards: [...]} objects
 */

// Helper to determine treatment from card data
function determineTreatment(card) {
  if (card.variantType === 'Showcase') return 'showcase'
  if (card.variantType === 'Hyperspace' && card.isFoil) return 'hyperspace_foil'
  if (card.isFoil) return 'foil'
  if (card.variantType === 'Hyperspace') return 'hyperspace'
  return 'base'
}

// Helper to determine slot type
function determineSlotType(card) {
  if (card.isLeader) return 'leader'
  if (card.isBase) return 'base'
  if (card.isFoil) return 'foil'
  if (card.rarity === 'Common') return 'common'
  if (card.rarity === 'Uncommon') return 'uncommon'
  if (card.rarity === 'Rare' || card.rarity === 'Legendary') return 'rare_legendary'
  return 'unknown'
}

/**
 * Main migration function
 */
export async function run(client) {
  // Get all sealed pools (pool_type = 'sealed' or NULL for older pools)
  const poolsResult = await client.query(`
    SELECT id, share_id, user_id, set_code, packs
    FROM card_pools
    WHERE (pool_type = 'sealed' OR pool_type IS NULL)
      AND packs IS NOT NULL
    ORDER BY created_at DESC
  `)

  console.log(`   Found ${poolsResult.rows.length} sealed pools to check`)

  let totalPoolsProcessed = 0
  let totalPoolsSkipped = 0
  let totalCardsInserted = 0
  let totalShowcaseLeaders = 0

  for (const poolRow of poolsResult.rows) {
    const { id, share_id, user_id, set_code, packs } = poolRow

    // Parse packs JSON
    let packsData
    try {
      packsData = typeof packs === 'string' ? JSON.parse(packs) : packs
    } catch {
      console.log(`   Pool ${share_id}: Invalid packs JSON, skipping`)
      totalPoolsSkipped++
      continue
    }

    if (!Array.isArray(packsData) || packsData.length === 0) {
      totalPoolsSkipped++
      continue
    }

    // Check if already tracked
    const existingResult = await client.query(
      `SELECT COUNT(*) as count FROM card_generations WHERE source_share_id = $1`,
      [share_id]
    )

    if (parseInt(existingResult.rows[0].count) > 0) {
      totalPoolsSkipped++
      continue
    }

    // Build tracking records
    const records = []
    let showcaseCount = 0

    packsData.forEach((pack, packIndex) => {
      // Support both formats: pack as array or pack as {cards: [...]} object
      const packCards = Array.isArray(pack) ? pack : pack.cards
      if (!Array.isArray(packCards)) return

      packCards.forEach(card => {
        if (!card || !card.id) return

        const treatment = determineTreatment(card)
        if (treatment === 'showcase' && card.isLeader) {
          showcaseCount++
        }

        records.push([
          card.id,
          card.set || set_code,
          card.name,
          card.subtitle || null,
          card.type,
          card.rarity,
          card.aspects || [],
          treatment,
          card.variantType,
          card.isFoil || false,
          card.variantType === 'Hyperspace',
          card.variantType === 'Showcase',
          'booster',
          determineSlotType(card),
          'sealed',
          id,
          share_id,
          packIndex,
          user_id
        ])
      })
    })

    if (records.length === 0) {
      totalPoolsSkipped++
      continue
    }

    // Insert records in batches to avoid query size limits
    const BATCH_SIZE = 100
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const placeholders = batch.map((_, idx) => {
        const base = idx * 19
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13}, $${base+14}, $${base+15}, $${base+16}, $${base+17}, $${base+18}, $${base+19})`
      }).join(', ')

      const values = batch.flat()

      await client.query(
        `INSERT INTO card_generations (
          card_id, set_code, card_name, card_subtitle, card_type, rarity, aspects,
          treatment, variant_type, is_foil, is_hyperspace, is_showcase,
          pack_type, slot_type, source_type, source_id, source_share_id, pack_index, user_id
        ) VALUES ${placeholders}`,
        values
      )
    }

    totalPoolsProcessed++
    totalCardsInserted += records.length
    totalShowcaseLeaders += showcaseCount

    if (showcaseCount > 0) {
      console.log(`   Pool ${share_id}: ${records.length} cards, ${showcaseCount} showcase leaders`)
    }
  }

  console.log(`   Summary: ${totalPoolsProcessed} pools processed, ${totalPoolsSkipped} skipped`)
  console.log(`   Total: ${totalCardsInserted} cards inserted, ${totalShowcaseLeaders} showcase leaders`)
}
