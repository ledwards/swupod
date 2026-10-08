/**
 * Migration 026: Fix remaining pool packs with wrong card ID format
 *
 * THE BUG
 * =======
 * Migration 021 fixed the `cards` array in card_pools but somehow the `packs`
 * array wasn't saved properly. This left some pools with correct IDs in `cards`
 * but wrong display format IDs in `packs`.
 *
 * When migration 022 backfilled tracking records, it read from `packs` and
 * stored the wrong format IDs in card_generations.
 *
 * THE FIX
 * =======
 * 1. Fix any remaining display-format IDs in card_pools.packs
 * 2. Fix any remaining display-format IDs in card_generations
 */

import { getCardsBySet } from '../src/utils/cardData.ts'

// Build maps
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

export async function run(client) {
  const { displayToInternal, nameSetVariantToInternal } = buildCardMaps()
  console.log(`   Built card maps: ${Object.keys(displayToInternal).length} entries`)

  // 1. Fix card_pools.packs - collect updates first
  console.log('   Fetching card_pools...')
  const poolsResult = await client.query('SELECT id, share_id, packs FROM card_pools WHERE packs IS NOT NULL')
  console.log(`   Found ${poolsResult.rows.length} pools with packs`)

  const poolUpdates = []
  let poolCardsFixed = 0

  for (const row of poolsResult.rows) {
    let packs = typeof row.packs === 'string' ? JSON.parse(row.packs) : row.packs
    if (!Array.isArray(packs)) continue

    let packsFixedCount = 0
    packs = packs.map(pack => {
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

    if (packsFixedCount > 0) {
      poolUpdates.push({ id: row.id, packs: JSON.stringify(packs) })
      poolCardsFixed += packsFixedCount
    }
  }

  // Apply pool updates in batches
  if (poolUpdates.length > 0) {
    console.log(`   Applying ${poolUpdates.length} pool updates...`)
    for (const update of poolUpdates) {
      await client.query(
        'UPDATE card_pools SET packs = $1 WHERE id = $2',
        [update.packs, update.id]
      )
    }
  }
  console.log(`   card_pools.packs: ${poolUpdates.length} pools fixed, ${poolCardsFixed} cards fixed`)

  // 2. Fix card_generations.card_id (any remaining display format IDs)
  console.log('   Fetching card_generations with display format IDs...')
  const genResult = await client.query(`
    SELECT id, card_id, card_name, set_code, variant_type
    FROM card_generations
    WHERE card_id ~ '^[A-Z]+-[0-9]+$'
  `)
  console.log(`   Found ${genResult.rows.length} records`)

  // Collect updates
  const genUpdates = []
  for (const row of genResult.rows) {
    let internalId = displayToInternal[row.card_id]
    if (!internalId) {
      const key = `${row.card_name}|${row.set_code}|${row.variant_type || 'Normal'}`
      internalId = nameSetVariantToInternal[key]
    }
    if (internalId) {
      genUpdates.push({ id: row.id, cardId: internalId })
    }
  }

  // Apply updates in batches
  if (genUpdates.length > 0) {
    console.log(`   Applying ${genUpdates.length} card_generation updates...`)
    const batchSize = 500
    for (let i = 0; i < genUpdates.length; i += batchSize) {
      const batch = genUpdates.slice(i, i + batchSize)
      for (const update of batch) {
        await client.query(
          'UPDATE card_generations SET card_id = $1 WHERE id = $2',
          [update.cardId, update.id]
        )
      }
      if (i + batchSize < genUpdates.length) {
        console.log(`     Progress: ${Math.min(i + batchSize, genUpdates.length)}/${genUpdates.length}`)
      }
    }
  }
  console.log(`   card_generations: ${genResult.rows.length} found with display format, ${genUpdates.length} fixed`)
}
