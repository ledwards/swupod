/**
 * Migration 056: Convert old-format card IDs to UUID format (streaming version)
 *
 * BACKGROUND
 * ==========
 * Same data conversion as 048/049, but those loaded every row of
 * card_pools/pod_players/pods/built_decks into memory at once and OOMed
 * at the 4GB heap on step 3 ("Fixing card_pools JSON columns"). 048 and
 * 049 were marked applied manually to unblock deploys; this migration
 * does the JSON conversion properly by streaming row IDs and processing
 * small batches.
 *
 * WHAT THIS MIGRATION FIXES
 * =========================
 * 1. card_pools.cards[].id, packs[].cards[].id — batched JSON processing
 * 2. pod_players JSON fields — current_pack, leaders, drafted_cards, drafted_leaders
 * 3. pods.all_packs — batched JSON processing
 * 4. built_decks — leader.id, base.id, deck[].id, sideboard[].id
 *
 * (Steps for card_generations.card_id and draft_picks.card_id already
 * completed during 048/049 via bulk SQL before the OOM.)
 *
 * APPROACH
 * ========
 * For each table, first fetch only the list of primary-key IDs (tiny).
 * Then process those IDs in batches of BATCH_SIZE, fetching JSON columns
 * only for the current batch. After each row is updated, JS garbage
 * collection can reclaim it before the next row is fetched.
 *
 * SAFETY
 * ======
 * - Idempotent: UUID-format IDs are skipped in fixCardsArray().
 * - Non-destructive: only changes the .id field, preserves all other data.
 * - Safe under concurrent writes: each row is read + updated in isolation,
 *   so an app process editing a different row won't conflict.
 */

import { getCardsBySet } from '../src/utils/cardData.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BATCH_SIZE = 50

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

function parseJson(val) {
  if (val == null) return null
  return typeof val === 'string' ? JSON.parse(val) : val
}

async function getAllIds(client, tableName, whereClause = '') {
  const sql = `SELECT id FROM ${tableName} ${whereClause} ORDER BY id`
  const result = await client.query(sql)
  return result.rows.map(r => r.id)
}

async function fixCardPoolsBatch(client, ids, lookup) {
  const result = await client.query(
    'SELECT id, cards, packs FROM card_pools WHERE id = ANY($1::uuid[])',
    [ids]
  )
  let updated = 0
  let fixed = 0
  for (const row of result.rows) {
    const cards = parseJson(row.cards)
    let packs = parseJson(row.packs)

    const cardsResult = fixCardsArray(cards, lookup)
    let packsFixed = 0

    if (packs && Array.isArray(packs)) {
      packs = packs.map(pack => {
        if (Array.isArray(pack)) {
          const r = fixCardsArray(pack, lookup)
          packsFixed += r.fixed
          return r.cards
        } else if (pack && pack.cards) {
          const r = fixCardsArray(pack.cards, lookup)
          packsFixed += r.fixed
          return { ...pack, cards: r.cards }
        }
        return pack
      })
    }

    if (cardsResult.fixed + packsFixed > 0) {
      await client.query(
        'UPDATE card_pools SET cards = $1, packs = $2 WHERE id = $3',
        [JSON.stringify(cardsResult.cards), packs ? JSON.stringify(packs) : null, row.id]
      )
      updated++
      fixed += cardsResult.fixed + packsFixed
    }
  }
  return { updated, fixed }
}

async function fixPodPlayersBatch(client, ids, lookup) {
  const result = await client.query(
    `SELECT id, current_pack, leaders, drafted_cards, drafted_leaders
     FROM pod_players WHERE id = ANY($1::uuid[])`,
    [ids]
  )
  let updated = 0
  let fixed = 0
  for (const row of result.rows) {
    let currentPack = parseJson(row.current_pack)
    let leaders = parseJson(row.leaders)
    let draftedCards = parseJson(row.drafted_cards)
    let draftedLeaders = parseJson(row.drafted_leaders)
    let rowFixed = 0

    if (currentPack) {
      const r = fixCardsArray(currentPack, lookup)
      currentPack = r.cards; rowFixed += r.fixed
    }
    if (leaders) {
      const r = fixCardsArray(leaders, lookup)
      leaders = r.cards; rowFixed += r.fixed
    }
    if (draftedCards) {
      const r = fixCardsArray(draftedCards, lookup)
      draftedCards = r.cards; rowFixed += r.fixed
    }
    if (draftedLeaders) {
      const r = fixCardsArray(draftedLeaders, lookup)
      draftedLeaders = r.cards; rowFixed += r.fixed
    }

    if (rowFixed > 0) {
      await client.query(
        `UPDATE pod_players
         SET current_pack = $1, leaders = $2, drafted_cards = $3, drafted_leaders = $4
         WHERE id = $5`,
        [
          currentPack ? JSON.stringify(currentPack) : null,
          leaders ? JSON.stringify(leaders) : null,
          draftedCards ? JSON.stringify(draftedCards) : null,
          draftedLeaders ? JSON.stringify(draftedLeaders) : null,
          row.id
        ]
      )
      updated++
      fixed += rowFixed
    }
  }
  return { updated, fixed }
}

async function fixPodsAllPacksBatch(client, ids, lookup) {
  const result = await client.query(
    'SELECT id, all_packs FROM pods WHERE id = ANY($1::uuid[]) AND all_packs IS NOT NULL',
    [ids]
  )
  let updated = 0
  let fixed = 0
  for (const row of result.rows) {
    let allPacks = parseJson(row.all_packs)
    let rowFixed = 0

    if (Array.isArray(allPacks)) {
      allPacks = allPacks.map(playerPacks => {
        if (!Array.isArray(playerPacks)) return playerPacks
        return playerPacks.map(pack => {
          if (Array.isArray(pack)) {
            const r = fixCardsArray(pack, lookup)
            rowFixed += r.fixed
            return r.cards
          } else if (pack && pack.cards) {
            const r = fixCardsArray(pack.cards, lookup)
            rowFixed += r.fixed
            return { ...pack, cards: r.cards }
          }
          return pack
        })
      })
    }

    if (rowFixed > 0) {
      await client.query(
        'UPDATE pods SET all_packs = $1 WHERE id = $2',
        [JSON.stringify(allPacks), row.id]
      )
      updated++
      fixed += rowFixed
    }
  }
  return { updated, fixed }
}

async function fixBuiltDecksBatch(client, ids, lookup) {
  const result = await client.query(
    'SELECT id, leader, base, deck, sideboard FROM built_decks WHERE id = ANY($1::uuid[])',
    [ids]
  )
  let updated = 0
  let fixed = 0
  for (const row of result.rows) {
    let leader = parseJson(row.leader)
    let base = parseJson(row.base)
    let deck = parseJson(row.deck)
    let sideboard = parseJson(row.sideboard)
    let rowFixed = 0

    if (leader && leader.id && !UUID_REGEX.test(leader.id)) {
      const uuid = findUuid(lookup, leader.name, leader.set, leader.variantType)
      if (uuid) { leader = { ...leader, id: uuid }; rowFixed++ }
    }
    if (base && base.id && !UUID_REGEX.test(base.id)) {
      const uuid = findUuid(lookup, base.name, base.set, base.variantType)
      if (uuid) { base = { ...base, id: uuid }; rowFixed++ }
    }
    if (deck) {
      const r = fixCardsArray(deck, lookup)
      deck = r.cards; rowFixed += r.fixed
    }
    if (sideboard) {
      const r = fixCardsArray(sideboard, lookup)
      sideboard = r.cards; rowFixed += r.fixed
    }

    if (rowFixed > 0) {
      await client.query(
        `UPDATE built_decks
         SET leader = $1, base = $2, deck = $3, sideboard = $4
         WHERE id = $5`,
        [
          JSON.stringify(leader),
          JSON.stringify(base),
          JSON.stringify(deck),
          JSON.stringify(sideboard),
          row.id
        ]
      )
      updated++
      fixed += rowFixed
    }
  }
  return { updated, fixed }
}

async function streamTable(client, label, tableName, whereClause, batchFn, lookup) {
  console.log(`${label}: scanning ${tableName}...`)
  const ids = await getAllIds(client, tableName, whereClause)
  if (ids.length === 0) {
    console.log(`   No rows to process`)
    return 0
  }
  console.log(`   ${ids.length} rows, batching at ${BATCH_SIZE}`)

  let totalUpdated = 0
  let totalFixed = 0
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE)
    const { updated, fixed } = await batchFn(client, batchIds, lookup)
    totalUpdated += updated
    totalFixed += fixed
    if (i + BATCH_SIZE < ids.length && (i / BATCH_SIZE) % 20 === 19) {
      console.log(`   ... ${Math.min(i + BATCH_SIZE, ids.length)}/${ids.length} scanned, ${totalUpdated} updated, ${totalFixed} IDs fixed`)
    }
  }
  console.log(`   Done: ${totalUpdated} rows updated, ${totalFixed} IDs converted`)
  return totalFixed
}

export async function run(client) {
  const lookup = buildLookup()
  const mapSize = Object.keys(lookup).length
  console.log(`   Built card lookup: ${mapSize} unique name|set|variant keys\n`)

  let totalFixed = 0
  totalFixed += await streamTable(client, '1. card_pools', 'card_pools', '', fixCardPoolsBatch, lookup)
  totalFixed += await streamTable(client, '2. pod_players', 'pod_players', '', fixPodPlayersBatch, lookup)
  totalFixed += await streamTable(client, '3. pods.all_packs', 'pods', 'WHERE all_packs IS NOT NULL', fixPodsAllPacksBatch, lookup)
  totalFixed += await streamTable(client, '4. built_decks', 'built_decks', '', fixBuiltDecksBatch, lookup)

  console.log('\n========================================')
  console.log('MIGRATION 056 COMPLETE')
  console.log('========================================')
  console.log(`   Total card IDs converted to UUID: ${totalFixed}`)
}
