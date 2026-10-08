/**
 * Migration 025: Fix SWUDB format card IDs
 *
 * THE BUG
 * =======
 * Some card_generations records have card_id in SWUDB format (e.g., "SEC-002")
 * instead of internal ID format (e.g., "39385").
 *
 * SWUDB format uses zero-padded 3-digit collector numbers:
 * - SWUDB: "SEC-002"
 * - cardId: "SEC-2"
 * - internal: "39385"
 *
 * Migration 021 only handled cardId format, not SWUDB format.
 *
 * THE FIX
 * =======
 * Build a map from SWUDB format to internal ID by:
 * 1. Parsing cardId to extract set + number (e.g., "SEC-2" -> ["SEC", "2"])
 * 2. Creating SWUDB format key by zero-padding (e.g., "SEC-002")
 * 3. Mapping to internal ID
 */

import { getCardsBySet } from '../src/utils/cardData.ts'

export async function run(client) {
  console.log('Building SWUDB format card ID map...')

  // Build map from SWUDB format to internal ID
  const swudbToInternal = {}
  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']

  for (const setCode of sets) {
    const cards = getCardsBySet(setCode) || []
    for (const card of cards) {
      if (card.cardId && card.id) {
        // Parse cardId to extract number (e.g., "SEC-2" -> "2")
        const match = card.cardId.match(/^([A-Z]+)-(\d+)$/)
        if (match) {
          const [, set, num] = match
          // Create SWUDB format key with zero-padded number
          const swudbKey = `${set}-${num.padStart(3, '0')}`
          swudbToInternal[swudbKey] = card.id
        }
      }
    }
  }

  console.log(`   Built map: ${Object.keys(swudbToInternal).length} SWUDB format entries`)

  // Find records with SWUDB format (contains "-" and has exactly 3 digits after dash)
  const result = await client.query(`
    SELECT id, card_id, card_name, set_code
    FROM card_generations
    WHERE card_id ~ '^[A-Z]+-[0-9]{3}$'
  `)

  console.log(`   Found ${result.rows.length} records with SWUDB format`)

  // Collect all updates in memory first
  const updates = []
  const warnings = []

  for (const row of result.rows) {
    const internalId = swudbToInternal[row.card_id]
    if (internalId) {
      updates.push({ id: row.id, newCardId: internalId })
    } else {
      warnings.push(`No mapping for ${row.card_id} (${row.card_name})`)
    }
  }

  // Apply updates in batches
  if (updates.length > 0) {
    console.log(`   Applying ${updates.length} updates...`)
    const batchSize = 500

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)
      for (const update of batch) {
        await client.query(
          'UPDATE card_generations SET card_id = $1 WHERE id = $2',
          [update.newCardId, update.id]
        )
      }
      if (i + batchSize < updates.length) {
        console.log(`     Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
      }
    }
  }

  // Log warnings at the end
  if (warnings.length > 0) {
    console.log(`   Warnings (${warnings.length}):`)
    warnings.forEach(w => console.log(`     - ${w}`))
  }

  console.log(`   Fixed ${updates.length} records`)
}
