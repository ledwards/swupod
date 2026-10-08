/**
 * Migration 021: Fix card ID format across all tables
 *
 * BACKGROUND
 * ==========
 * Cards in our system have two different ID fields:
 *
 * 1. `id` (internal ID)
 *    - Example: "42080"
 *    - Used as the lookup key in the app's card cache
 *    - Required for image URL lookups, card data enrichment, etc.
 *    - This is an internal implementation detail, not meaningful to users
 *
 * 2. `cardId` (external/display ID)
 *    - Example: "SEC-1029"
 *    - The canonical card identifier used by external systems (SWUDB, etc.)
 *    - Used for deck exports (converted to "SEC_029" format for SWUDB)
 *    - Meaningful to users and matches printed card numbers
 *
 * THE BUG
 * =======
 * Some code paths incorrectly stored `cardId` (display ID) in database fields
 * that expect `id` (internal ID). This causes lookups to fail because:
 *
 *   cardCache["42080"] = { imageUrl: "https://..." }  // Card cache keyed by internal ID
 *   cardCache["SEC-1029"] = undefined                  // Display ID not found!
 *
 * Result: Broken images on showcases page, potential issues elsewhere.
 *
 * WHAT THIS MIGRATION FIXES
 * =========================
 * - card_generations.card_id: Used for showcase image lookups
 * - card_pools.cards[].id: Card objects stored in pool JSON
 * - card_pools.packs[].id: Pack card objects stored in pool JSON
 * - draft_pod_players JSON fields: current_pack, leaders, drafted_cards, drafted_leaders
 * - draft_pods.all_packs: All pack data for draft
 *
 * The migration identifies records with display ID format (contains "-") and
 * converts them to internal ID format using the card data as the source of truth.
 *
 * SAFETY
 * ======
 * - Idempotent: Safe to run multiple times (only updates records with "-" in ID)
 * - Fresh DB safe: On empty tables, simply does nothing
 * - Non-destructive: Only changes the ID format, preserves all other data
 */

import { getCardsBySet } from '../src/utils/cardData.js'

/**
 * Build lookup maps from card data
 * - displayToInternal: Maps "SEC-1029" -> "42080"
 * - nameSetVariantToInternal: Fallback map using card name + set + variant
 */
function buildCardMaps() {
  const displayToInternal = {}
  const nameSetVariantToInternal = {}
  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']

  for (const setCode of sets) {
    const cards = getCardsBySet(setCode) || []
    for (const card of cards) {
      if (card.cardId && card.id) {
        displayToInternal[card.cardId] = card.id
      }
      const key = `${card.name}|${card.set}|${card.variantType || 'Normal'}`
      nameSetVariantToInternal[key] = card.id
    }
  }

  return { displayToInternal, nameSetVariantToInternal }
}

/**
 * Fix a single card's id field if it's in display format
 */
function fixCardId(card, displayToInternal, nameSetVariantToInternal) {
  if (!card || !card.id || !card.id.includes('-')) {
    return { card, fixed: false }
  }

  let internalId = displayToInternal[card.id]
  if (!internalId && card.name && card.set) {
    const key = `${card.name}|${card.set}|${card.variantType || 'Normal'}`
    internalId = nameSetVariantToInternal[key]
  }

  if (internalId) {
    return { card: { ...card, id: internalId }, fixed: true }
  }
  return { card, fixed: false }
}

/**
 * Fix all cards in an array
 */
function fixCardsArray(cards, displayToInternal, nameSetVariantToInternal) {
  if (!Array.isArray(cards)) return { cards, fixed: 0 }

  let fixed = 0
  const fixedCards = cards.map(card => {
    const result = fixCardId(card, displayToInternal, nameSetVariantToInternal)
    if (result.fixed) fixed++
    return result.card
  })

  return { cards: fixedCards, fixed }
}

/**
 * Main migration function
 */
export async function run(client) {
  const { displayToInternal, nameSetVariantToInternal } = buildCardMaps()
  console.log(`   Built card ID maps: ${Object.keys(displayToInternal).length} cards`)

  let totalFixed = 0

  // 1. Fix card_generations.card_id
  const genResult = await client.query(`
    SELECT id, card_id, card_name, set_code, variant_type
    FROM card_generations
    WHERE card_id LIKE '%-%'
  `)

  for (const row of genResult.rows) {
    let internalId = displayToInternal[row.card_id]
    if (!internalId) {
      const key = `${row.card_name}|${row.set_code}|${row.variant_type || 'Normal'}`
      internalId = nameSetVariantToInternal[key]
    }
    if (internalId) {
      await client.query('UPDATE card_generations SET card_id = $1 WHERE id = $2', [internalId, row.id])
      totalFixed++
    }
  }
  console.log(`   card_generations: ${genResult.rows.length} found, ${totalFixed} fixed`)

  // 2. Fix card_pools.cards and card_pools.packs
  const poolsResult = await client.query('SELECT id, cards, packs FROM card_pools')
  let poolsFixed = 0, poolCardsFixed = 0

  for (const row of poolsResult.rows) {
    let cards = typeof row.cards === 'string' ? JSON.parse(row.cards) : row.cards
    let packs = row.packs ? (typeof row.packs === 'string' ? JSON.parse(row.packs) : row.packs) : null

    const cardsResult = fixCardsArray(cards, displayToInternal, nameSetVariantToInternal)
    let packsFixedCount = 0

    if (packs && Array.isArray(packs)) {
      packs = packs.map(pack => {
        // Handle both formats: pack as array or pack as {cards: [...]} object
        if (Array.isArray(pack)) {
          const packResult = fixCardsArray(pack, displayToInternal, nameSetVariantToInternal)
          packsFixedCount += packResult.fixed
          return packResult.cards
        } else if (pack && pack.cards) {
          const packResult = fixCardsArray(pack.cards, displayToInternal, nameSetVariantToInternal)
          packsFixedCount += packResult.fixed
          return { ...pack, cards: packResult.cards }
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
  console.log(`   card_pools: ${poolsFixed} pools updated, ${poolCardsFixed} cards fixed`)

  // 3. Fix draft_pod_players JSON fields
  const playersResult = await client.query(`
    SELECT id, current_pack, leaders, drafted_cards, drafted_leaders
    FROM draft_pod_players
  `)
  let playersFixed = 0, playerCardsFixed = 0

  for (const row of playersResult.rows) {
    let currentPack = row.current_pack ? (typeof row.current_pack === 'string' ? JSON.parse(row.current_pack) : row.current_pack) : null
    let leaders = row.leaders ? (typeof row.leaders === 'string' ? JSON.parse(row.leaders) : row.leaders) : null
    let draftedCards = row.drafted_cards ? (typeof row.drafted_cards === 'string' ? JSON.parse(row.drafted_cards) : row.drafted_cards) : null
    let draftedLeaders = row.drafted_leaders ? (typeof row.drafted_leaders === 'string' ? JSON.parse(row.drafted_leaders) : row.drafted_leaders) : null

    let fixedCount = 0

    if (currentPack) {
      const r = fixCardsArray(currentPack, displayToInternal, nameSetVariantToInternal)
      currentPack = r.cards
      fixedCount += r.fixed
    }
    if (leaders) {
      const r = fixCardsArray(leaders, displayToInternal, nameSetVariantToInternal)
      leaders = r.cards
      fixedCount += r.fixed
    }
    if (draftedCards) {
      const r = fixCardsArray(draftedCards, displayToInternal, nameSetVariantToInternal)
      draftedCards = r.cards
      fixedCount += r.fixed
    }
    if (draftedLeaders) {
      const r = fixCardsArray(draftedLeaders, displayToInternal, nameSetVariantToInternal)
      draftedLeaders = r.cards
      fixedCount += r.fixed
    }

    if (fixedCount > 0) {
      await client.query(`
        UPDATE draft_pod_players
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
  console.log(`   draft_pod_players: ${playersFixed} players updated, ${playerCardsFixed} cards fixed`)

  // 4. Fix draft_pods.all_packs
  const podsResult = await client.query('SELECT id, all_packs FROM draft_pods WHERE all_packs IS NOT NULL')
  let podsFixed = 0, podCardsFixed = 0

  for (const row of podsResult.rows) {
    let allPacks = typeof row.all_packs === 'string' ? JSON.parse(row.all_packs) : row.all_packs
    let fixedCount = 0

    if (Array.isArray(allPacks)) {
      allPacks = allPacks.map(playerPacks => {
        if (!Array.isArray(playerPacks)) return playerPacks
        return playerPacks.map(pack => {
          // Handle both formats: pack as array or pack as {cards: [...]} object
          if (Array.isArray(pack)) {
            const r = fixCardsArray(pack, displayToInternal, nameSetVariantToInternal)
            fixedCount += r.fixed
            return r.cards
          } else if (pack && pack.cards) {
            const r = fixCardsArray(pack.cards, displayToInternal, nameSetVariantToInternal)
            fixedCount += r.fixed
            return { ...pack, cards: r.cards }
          }
          return pack
        })
      })
    }

    if (fixedCount > 0) {
      await client.query('UPDATE draft_pods SET all_packs = $1 WHERE id = $2', [JSON.stringify(allPacks), row.id])
      podsFixed++
      podCardsFixed += fixedCount
    }
  }
  console.log(`   draft_pods: ${podsFixed} pods updated, ${podCardsFixed} cards fixed`)
}
