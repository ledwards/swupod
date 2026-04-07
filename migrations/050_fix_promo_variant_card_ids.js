/**
 * Migration 050: Convert promo variant card IDs to their Normal variant UUIDs
 *
 * Migration 048 matched card_id by exact name+set+variantType, but promo
 * variants (PQ, SS, Prerelease, Weekly Play) are filtered out of cards.json
 * so they had no match. These are the same game piece as the Normal variant
 * — just a different printing — so we map them to the Normal variant UUID.
 *
 * Also handles any remaining Token cards the same way.
 */

import { getCardsBySet } from '../src/utils/cardData.js'

async function run(client) {
  // Build lookup: name|set -> Normal variant UUID
  const normalLookup = {}
  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']

  for (const setCode of sets) {
    const cards = getCardsBySet(setCode) || []
    for (const card of cards) {
      if (card.variantType === 'Normal') {
        const key = `${card.name}|${card.set}`
        normalLookup[key] = card.id
      }
    }
  }

  console.log(`   Built Normal variant lookup: ${Object.keys(normalLookup).length} cards\n`)

  // Create temp lookup table
  await client.query(`
    CREATE TEMP TABLE _normal_uuid_lookup (
      card_name TEXT,
      set_code TEXT,
      uuid_id TEXT
    )
  `)

  const entries = Object.entries(normalLookup)
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100)
    const values = []
    const placeholders = []

    batch.forEach(([key, uuid], idx) => {
      const [name, set] = key.split('|')
      const base = idx * 3
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`)
      values.push(name, set, uuid)
    })

    await client.query(
      `INSERT INTO _normal_uuid_lookup (card_name, set_code, uuid_id) VALUES ${placeholders.join(', ')}`,
      values
    )
  }

  const UUID_RE = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

  // Fix card_generations
  const genResult = await client.query(`
    UPDATE card_generations t
    SET card_id = lu.uuid_id
    FROM _normal_uuid_lookup lu
    WHERE t.card_name = lu.card_name
      AND t.set_code = lu.set_code
      AND t.card_id !~ '${UUID_RE}'
  `)
  console.log(`   card_generations: ${genResult.rowCount} promo/token records fixed`)

  // Fix draft_picks
  const picksResult = await client.query(`
    UPDATE draft_picks t
    SET card_id = lu.uuid_id
    FROM _normal_uuid_lookup lu
    WHERE t.card_name = lu.card_name
      AND t.set_code = lu.set_code
      AND t.card_id !~ '${UUID_RE}'
  `)
  console.log(`   draft_picks: ${picksResult.rowCount} promo/token records fixed`)

  // Check for any remaining
  const remaining = await client.query(`
    SELECT COUNT(*) AS cnt FROM card_generations WHERE card_id !~ '${UUID_RE}'
  `)
  const remainingPicks = await client.query(`
    SELECT COUNT(*) AS cnt FROM draft_picks WHERE card_id !~ '${UUID_RE}'
  `)
  console.log(`\n   Remaining non-UUID: card_generations=${remaining.rows[0].cnt}, draft_picks=${remainingPicks.rows[0].cnt}`)

  await client.query('DROP TABLE IF EXISTS _normal_uuid_lookup')
}

export { run }
