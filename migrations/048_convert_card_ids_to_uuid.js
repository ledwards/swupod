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
 * 1. card_generations.card_id — VARCHAR column (showcases page broken)
 * 2. draft_picks.card_id — VARCHAR column (draft stats enrichment broken)
 * 3. card_pools.cards[].id — JSON (pool card lookups)
 * 4. card_pools.packs[].cards[].id — JSON (pack card lookups)
 * 5. pod_players JSON fields — current_pack, leaders, drafted_cards, drafted_leaders
 * 6. pods.all_packs — JSON (draft log lookups)
 * 7. built_decks — leader.id, base.id, deck[].id, sideboard[].id (deck stats)
 *
 * APPROACH
 * =======
 * Matches old records to current card data by name + set + variantType.
 * Only updates records where card_id is NOT already in UUID format.
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
      // Prefer Normal variant for ambiguous matches
      if (!lookup[key] || card.variantType === 'Normal') {
        lookup[key] = card.id
      }
    }
  }

  return lookup
}

/**
 * Look up the UUID for a card, trying name+set+variant first,
 * then falling back to name+set (for variant mismatches)
 */
function findUuid(lookup, name, setCode, variantType) {
  const key = `${name}|${setCode}|${variantType || 'Normal'}`
  if (lookup[key]) return lookup[key]

  // Fallback: try Normal variant
  const normalKey = `${name}|${setCode}|Normal`
  return lookup[normalKey] || null
}

/**
 * Fix card IDs in an array of card objects
 */
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

export async function run(client) {
  const lookup = buildLookup()
  const mapSize = Object.keys(lookup).length
  console.log(`   Built card lookup: ${mapSize} unique name|set|variant keys\n`)

  let totalFixed = 0
  const unmatched = []

  // ============================================
  // 1. Fix card_generations.card_id
  // ============================================
  console.log('1. Fixing card_generations.card_id...')

  const genResult = await client.query(`
    SELECT id, card_id, card_name, set_code, variant_type
    FROM card_generations
    WHERE card_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `)

  let genFixed = 0
  for (const row of genResult.rows) {
    const uuid = findUuid(lookup, row.card_name, row.set_code, row.variant_type)
    if (uuid) {
      await client.query('UPDATE card_generations SET card_id = $1 WHERE id = $2', [uuid, row.id])
      genFixed++
    } else {
      unmatched.push(`card_generations #${row.id}: ${row.card_name} (${row.set_code} ${row.variant_type})`)
    }
  }
  totalFixed += genFixed
  console.log(`   Found ${genResult.rows.length} non-UUID records, fixed ${genFixed}`)

  // ============================================
  // 2. Fix draft_picks.card_id
  // ============================================
  console.log('2. Fixing draft_picks.card_id...')

  const picksResult = await client.query(`
    SELECT id, card_id, card_name, set_code, variant_type
    FROM draft_picks
    WHERE card_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `)

  let picksFixed = 0
  for (const row of picksResult.rows) {
    const uuid = findUuid(lookup, row.card_name, row.set_code, row.variant_type)
    if (uuid) {
      await client.query('UPDATE draft_picks SET card_id = $1 WHERE id = $2', [uuid, row.id])
      picksFixed++
    } else {
      unmatched.push(`draft_picks #${row.id}: ${row.card_name} (${row.set_code} ${row.variant_type})`)
    }
  }
  totalFixed += picksFixed
  console.log(`   Found ${picksResult.rows.length} non-UUID records, fixed ${picksFixed}`)

  // ============================================
  // 3. Fix card_pools.cards and card_pools.packs
  // ============================================
  console.log('3. Fixing card_pools JSON columns...')

  const poolsResult = await client.query('SELECT id, cards, packs FROM card_pools')
  let poolsFixed = 0
  let poolCardsFixed = 0

  for (const row of poolsResult.rows) {
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
  console.log(`   ${poolsFixed} pools updated, ${poolCardsFixed} card IDs fixed`)

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

  for (const row of playersResult.rows) {
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
  console.log(`   ${playersFixed} players updated, ${playerCardsFixed} card IDs fixed`)

  // ============================================
  // 5. Fix pods.all_packs
  // ============================================
  console.log('5. Fixing pods.all_packs...')

  const podsResult = await client.query('SELECT id, all_packs FROM pods WHERE all_packs IS NOT NULL')
  let podsFixed = 0
  let podCardsFixed = 0

  for (const row of podsResult.rows) {
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
  console.log(`   ${podsFixed} pods updated, ${podCardsFixed} card IDs fixed`)

  // ============================================
  // 6. Fix built_decks JSON fields
  // ============================================
  console.log('6. Fixing built_decks JSON columns...')

  const decksResult = await client.query('SELECT id, leader, base, deck, sideboard FROM built_decks')
  let decksFixed = 0
  let deckCardsFixed = 0

  for (const row of decksResult.rows) {
    let leader = row.leader ? (typeof row.leader === 'string' ? JSON.parse(row.leader) : row.leader) : null
    let base = row.base ? (typeof row.base === 'string' ? JSON.parse(row.base) : row.base) : null
    let deck = row.deck ? (typeof row.deck === 'string' ? JSON.parse(row.deck) : row.deck) : null
    let sideboard = row.sideboard ? (typeof row.sideboard === 'string' ? JSON.parse(row.sideboard) : row.sideboard) : null

    let fixedCount = 0

    // Fix leader (single card object)
    if (leader && leader.id && !UUID_REGEX.test(leader.id)) {
      const uuid = findUuid(lookup, leader.name, leader.set, leader.variantType)
      if (uuid) { leader = { ...leader, id: uuid }; fixedCount++ }
    }

    // Fix base (single card object)
    if (base && base.id && !UUID_REGEX.test(base.id)) {
      const uuid = findUuid(lookup, base.name, base.set, base.variantType)
      if (uuid) { base = { ...base, id: uuid }; fixedCount++ }
    }

    // Fix deck array
    if (deck) {
      const r = fixCardsArray(deck, lookup)
      deck = r.cards; fixedCount += r.fixed
    }

    // Fix sideboard array
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
  console.log(`   ${decksFixed} decks updated, ${deckCardsFixed} card IDs fixed`)

  // ============================================
  // Summary
  // ============================================
  console.log('\n========================================')
  console.log('MIGRATION COMPLETE')
  console.log('========================================')
  console.log(`   Total card IDs converted to UUID: ${totalFixed}`)

  if (unmatched.length > 0) {
    console.log(`\n   Unmatched records (${unmatched.length}):`)
    unmatched.slice(0, 20).forEach(msg => console.log(`     - ${msg}`))
    if (unmatched.length > 20) {
      console.log(`     ... and ${unmatched.length - 20} more`)
    }
  }

  console.log('')
}
