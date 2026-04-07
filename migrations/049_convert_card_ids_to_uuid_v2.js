/**
 * Migration 048: Convert old-format card IDs to UUID format
 *
 * BACKGROUND
 * ==========
 * On March 27 2026, card data migrated from swuapi v1 to v2.
 * - v1 internal IDs: numeric strings like "19476"
 * - v2 internal IDs: UUIDs like "019d3176-ab2a-7953-9459-a3555e41e3a0"
 *
 * Migration 045 widened the card_id columns to TEXT for UUID support,
 * but existing records were never converted. This breaks any code that
 * looks up old card_ids against the current UUID-keyed card cache.
 *
 * WHAT THIS MIGRATION FIXES
 * =========================
 * 1. card_generations.card_id — bulk SQL UPDATE (fast)
 * 2. draft_picks.card_id — bulk SQL UPDATE (fast)
 * 3. card_pools.cards[].id, packs[].cards[].id — JSON processing
 * 4. pod_players JSON fields — current_pack, leaders, drafted_cards, drafted_leaders
 * 5. pods.all_packs — JSON processing
 * 6. built_decks — leader.id, base.id, deck[].id, sideboard[].id
 *
 * APPROACH
 * =======
 * Steps 1-2 use a temp lookup table + UPDATE FROM for bulk speed.
 * Steps 3-6 process JSON in JS (no way around it) but skip already-fixed rows.
 *
 * SAFETY
 * ======
 * - Idempotent: UUID-format IDs are skipped
 * - Non-destructive: only changes the id field, preserves all other data
 * - Logs unmatched records for manual review
 */

import { getCardsBySet } from '../src/utils/cardData.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Build lookup map: "name|set|variantType" -> UUID
 */
function buildLookup() {
  const lookup = {}
  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']

  for (const setCode of sets) {
    const cards = getCardsBySet(setCode) || []
    for (const card of cards) {
      const key = `${card.name}|${card.set}|${card.variantType || 'Normal'}`
      if (!lookup[key] || card.variantType === 'Normal') {
        lookup[key] = card.id
      }
    }
  }

  return lookup
}

function findUuid(lookup, name, setCode, variantType) {
  const key = `${name}|${setCode}|${variantType || 'Normal'}`
  if (lookup[key]) return lookup[key]
  const normalKey = `${name}|${setCode}|Normal`
  return lookup[normalKey] || null
}

function fixCardsArray(cards, lookup) {
  if (!Array.isArray(cards)) return { cards, fixed: 0 }

  let fixed = 0
  const fixedCards = cards.map(card => {
    if (!card || !card.id || UUID_REGEX.test(card.id)) return card

    const uuid = findUuid(lookup, card.name, card.set, card.variantType)
    if (uuid) {
      fixed++
      return { ...card, id: uuid }
    }
    return card
  })

  return { cards: fixedCards, fixed }
}

/**
 * Create a temp table with name+set+variant -> UUID mappings,
 * then bulk UPDATE the target table in a single statement.
 */
async function bulkFixCardIdColumn(client, tableName, lookup) {
  // Create temp table with the lookup data
  await client.query(`
    CREATE TEMP TABLE IF NOT EXISTS _card_uuid_lookup (
      card_name TEXT,
      set_code TEXT,
      variant_type TEXT,
      uuid_id TEXT
    )
  `)
  await client.query('TRUNCATE _card_uuid_lookup')

  // Batch insert lookup entries (100 at a time)
  const entries = Object.entries(lookup)
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100)
    const values = []
    const placeholders = []

    batch.forEach(([key, uuid], idx) => {
      const [name, set, variant] = key.split('|')
      const base = idx * 4
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
      values.push(name, set, variant || 'Normal', uuid)
    })

    await client.query(
      `INSERT INTO _card_uuid_lookup (card_name, set_code, variant_type, uuid_id) VALUES ${placeholders.join(', ')}`,
      values
    )
  }

  // Count non-UUID records
  const countResult = await client.query(`
    SELECT COUNT(*) AS total FROM ${tableName}
    WHERE card_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `)
  const total = parseInt(countResult.rows[0].total)

  if (total === 0) {
    console.log(`   No non-UUID records found — already up to date`)
    return 0
  }

  // Bulk update: match by name + set + variant_type
  const updateResult = await client.query(`
    UPDATE ${tableName} t
    SET card_id = lu.uuid_id
    FROM _card_uuid_lookup lu
    WHERE t.card_name = lu.card_name
      AND t.set_code = lu.set_code
      AND COALESCE(t.variant_type, 'Normal') = lu.variant_type
      AND t.card_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `)

  const fixed = updateResult.rowCount
  const unmatched = total - fixed
  console.log(`   Found ${total} non-UUID records, fixed ${fixed}${unmatched > 0 ? `, ${unmatched} unmatched` : ''}`)
  return fixed
}

export async function run(client) {
  const lookup = buildLookup()
  const mapSize = Object.keys(lookup).length
  console.log(`   Built card lookup: ${mapSize} unique name|set|variant keys\n`)

  let totalFixed = 0

  // ============================================
  // 1. Fix card_generations.card_id (bulk SQL)
  // ============================================
  console.log('1. Fixing card_generations.card_id...')
  totalFixed += await bulkFixCardIdColumn(client, 'card_generations', lookup)

  // ============================================
  // 2. Fix draft_picks.card_id (bulk SQL)
  // ============================================
  console.log('2. Fixing draft_picks.card_id...')
  totalFixed += await bulkFixCardIdColumn(client, 'draft_picks', lookup)

  // Clean up temp table
  await client.query('DROP TABLE IF EXISTS _card_uuid_lookup')

  // ============================================
  // 3. Fix card_pools.cards and card_pools.packs
  // ============================================
  console.log('3. Fixing card_pools JSON columns...')

  const poolsResult = await client.query('SELECT id, cards, packs FROM card_pools')
  let poolsFixed = 0
  let poolCardsFixed = 0
  const poolTotal = poolsResult.rows.length

  for (let i = 0; i < poolTotal; i++) {
    if (i > 0 && i % 500 === 0) console.log(`   ... processed ${i}/${poolTotal} pools`)
    const row = poolsResult.rows[i]
    let cards = typeof row.cards === 'string' ? JSON.parse(row.cards) : row.cards
    let packs = row.packs ? (typeof row.packs === 'string' ? JSON.parse(row.packs) : row.packs) : null

    const cardsResult = fixCardsArray(cards, lookup)
    let packsFixedCount = 0

    if (packs && Array.isArray(packs)) {
      packs = packs.map(pack => {
        if (Array.isArray(pack)) {
          const r = fixCardsArray(pack, lookup)
          packsFixedCount += r.fixed
          return r.cards
        } else if (pack && pack.cards) {
          const r = fixCardsArray(pack.cards, lookup)
          packsFixedCount += r.fixed
          return { ...pack, cards: r.cards }
        }
        return pack
      })
    }

    if (cardsResult.fixed + packsFixedCount > 0) {
      await client.query(
        'UPDATE card_pools SET cards = $1, packs = $2 WHERE id = $3',
        [JSON.stringify(cardsResult.cards), packs ? JSON.stringify(packs) : null, row.id]
      )
      poolsFixed++
      poolCardsFixed += cardsResult.fixed + packsFixedCount
    }
  }
  totalFixed += poolCardsFixed
  console.log(`   ${poolsFixed}/${poolTotal} pools updated, ${poolCardsFixed} card IDs fixed`)

  // ============================================
  // 4. Fix pod_players JSON fields
  // ============================================
  console.log('4. Fixing pod_players JSON columns...')

  const playersResult = await client.query(`
    SELECT id, current_pack, leaders, drafted_cards, drafted_leaders
    FROM pod_players
  `)
  let playersFixed = 0
  let playerCardsFixed = 0
  const playerTotal = playersResult.rows.length

  for (let i = 0; i < playerTotal; i++) {
    if (i > 0 && i % 500 === 0) console.log(`   ... processed ${i}/${playerTotal} players`)
    const row = playersResult.rows[i]
    let currentPack = row.current_pack ? (typeof row.current_pack === 'string' ? JSON.parse(row.current_pack) : row.current_pack) : null
    let leaders = row.leaders ? (typeof row.leaders === 'string' ? JSON.parse(row.leaders) : row.leaders) : null
    let draftedCards = row.drafted_cards ? (typeof row.drafted_cards === 'string' ? JSON.parse(row.drafted_cards) : row.drafted_cards) : null
    let draftedLeaders = row.drafted_leaders ? (typeof row.drafted_leaders === 'string' ? JSON.parse(row.drafted_leaders) : row.drafted_leaders) : null

    let fixedCount = 0

    if (currentPack) {
      const r = fixCardsArray(currentPack, lookup)
      currentPack = r.cards; fixedCount += r.fixed
    }
    if (leaders) {
      const r = fixCardsArray(leaders, lookup)
      leaders = r.cards; fixedCount += r.fixed
    }
    if (draftedCards) {
      const r = fixCardsArray(draftedCards, lookup)
      draftedCards = r.cards; fixedCount += r.fixed
    }
    if (draftedLeaders) {
      const r = fixCardsArray(draftedLeaders, lookup)
      draftedLeaders = r.cards; fixedCount += r.fixed
    }

    if (fixedCount > 0) {
      await client.query(`
        UPDATE pod_players
        SET current_pack = $1, leaders = $2, drafted_cards = $3, drafted_leaders = $4
        WHERE id = $5
      `, [
        currentPack ? JSON.stringify(currentPack) : null,
        leaders ? JSON.stringify(leaders) : null,
        draftedCards ? JSON.stringify(draftedCards) : null,
        draftedLeaders ? JSON.stringify(draftedLeaders) : null,
        row.id
      ])
      playersFixed++
      playerCardsFixed += fixedCount
    }
  }
  totalFixed += playerCardsFixed
  console.log(`   ${playersFixed}/${playerTotal} players updated, ${playerCardsFixed} card IDs fixed`)

  // ============================================
  // 5. Fix pods.all_packs
  // ============================================
  console.log('5. Fixing pods.all_packs...')

  const podsResult = await client.query('SELECT id, all_packs FROM pods WHERE all_packs IS NOT NULL')
  let podsFixed = 0
  let podCardsFixed = 0
  const podTotal = podsResult.rows.length

  for (let i = 0; i < podTotal; i++) {
    if (i > 0 && i % 100 === 0) console.log(`   ... processed ${i}/${podTotal} pods`)
    const row = podsResult.rows[i]
    let allPacks = typeof row.all_packs === 'string' ? JSON.parse(row.all_packs) : row.all_packs
    let fixedCount = 0

    if (Array.isArray(allPacks)) {
      allPacks = allPacks.map(playerPacks => {
        if (!Array.isArray(playerPacks)) return playerPacks
        return playerPacks.map(pack => {
          if (Array.isArray(pack)) {
            const r = fixCardsArray(pack, lookup)
            fixedCount += r.fixed
            return r.cards
          } else if (pack && pack.cards) {
            const r = fixCardsArray(pack.cards, lookup)
            fixedCount += r.fixed
            return { ...pack, cards: r.cards }
          }
          return pack
        })
      })
    }

    if (fixedCount > 0) {
      await client.query('UPDATE pods SET all_packs = $1 WHERE id = $2', [JSON.stringify(allPacks), row.id])
      podsFixed++
      podCardsFixed += fixedCount
    }
  }
  totalFixed += podCardsFixed
  console.log(`   ${podsFixed}/${podTotal} pods updated, ${podCardsFixed} card IDs fixed`)

  // ============================================
  // 6. Fix built_decks JSON fields
  // ============================================
  console.log('6. Fixing built_decks JSON columns...')

  const decksResult = await client.query('SELECT id, leader, base, deck, sideboard FROM built_decks')
  let decksFixed = 0
  let deckCardsFixed = 0
  const deckTotal = decksResult.rows.length

  for (let i = 0; i < deckTotal; i++) {
    if (i > 0 && i % 500 === 0) console.log(`   ... processed ${i}/${deckTotal} decks`)
    const row = decksResult.rows[i]
    let leader = row.leader ? (typeof row.leader === 'string' ? JSON.parse(row.leader) : row.leader) : null
    let base = row.base ? (typeof row.base === 'string' ? JSON.parse(row.base) : row.base) : null
    let deck = row.deck ? (typeof row.deck === 'string' ? JSON.parse(row.deck) : row.deck) : null
    let sideboard = row.sideboard ? (typeof row.sideboard === 'string' ? JSON.parse(row.sideboard) : row.sideboard) : null

    let fixedCount = 0

    if (leader && leader.id && !UUID_REGEX.test(leader.id)) {
      const uuid = findUuid(lookup, leader.name, leader.set, leader.variantType)
      if (uuid) { leader = { ...leader, id: uuid }; fixedCount++ }
    }

    if (base && base.id && !UUID_REGEX.test(base.id)) {
      const uuid = findUuid(lookup, base.name, base.set, base.variantType)
      if (uuid) { base = { ...base, id: uuid }; fixedCount++ }
    }

    if (deck) {
      const r = fixCardsArray(deck, lookup)
      deck = r.cards; fixedCount += r.fixed
    }

    if (sideboard) {
      const r = fixCardsArray(sideboard, lookup)
      sideboard = r.cards; fixedCount += r.fixed
    }

    if (fixedCount > 0) {
      await client.query(`
        UPDATE built_decks
        SET leader = $1, base = $2, deck = $3, sideboard = $4
        WHERE id = $5
      `, [
        JSON.stringify(leader),
        JSON.stringify(base),
        JSON.stringify(deck),
        JSON.stringify(sideboard),
        row.id
      ])
      decksFixed++
      deckCardsFixed += fixedCount
    }
  }
  totalFixed += deckCardsFixed
  console.log(`   ${decksFixed}/${deckTotal} decks updated, ${deckCardsFixed} card IDs fixed`)

  // ============================================
  // Summary
  // ============================================
  console.log('\n========================================')
  console.log('MIGRATION COMPLETE')
  console.log('========================================')
  console.log(`   Total card IDs converted to UUID: ${totalFixed}`)
  console.log('')
}
