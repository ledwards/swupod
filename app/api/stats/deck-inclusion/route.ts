// @ts-nocheck
// GET /api/stats/deck-inclusion - Get deck inclusion metrics per card
import { queryRows, queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { calculateAspectPenalty } from '@/src/services/cards/aspectPenalties'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const since = url.searchParams.get('since') || '2020-01-01'
    const until = url.searchParams.get('until') || '2099-12-31'
    const poolType = url.searchParams.get('poolType') || null
    const includeBots = url.searchParams.get('includeBots') !== 'false'
    const includeHumans = url.searchParams.get('includeHumans') !== 'false'
    const tournamentOnly = url.searchParams.get('tournamentOnly') === 'true'
    const topPlayersOnly = url.searchParams.get('topPlayersOnly') === 'true'
    const userId = url.searchParams.get('userId') || null

    // Build card lookup maps for enrichment
    const allCards = getAllCards()
    // Keyed by CMS id and normalized cardId (e.g. LAW_001)
    const cardMap = new Map()
    // Keyed by name|type → Normal variant, for merging variants as one card
    const nameTypeToCard = new Map()
    allCards.forEach(card => {
      cardMap.set(card.id, card)
      if (card.cardId) {
        const [set, num] = card.cardId.split('-')
        if (set && num) {
          cardMap.set(`${set}_${num.padStart(3, '0')}`, card)
          cardMap.set(card.cardId, card)
        }
      }
      if (card.variantType === 'Normal') {
        const key = `${card.name}|${card.type}`
        if (!nameTypeToCard.has(key)) {
          nameTypeToCard.set(key, card)
        }
      }
    })

    // Build bot/human filter clause
    let botFilter = ''
    if (!includeBots && includeHumans) {
      botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`
    } else if (includeBots && !includeHumans) {
      botFilter = `AND dpp.is_bot = true`
    }

    // Need the LEFT JOIN to pod_players for bot filtering on draft pools
    // For non-draft pools (sealed), there's no pod_players entry, so those are always "human"
    const needsBotJoin = !includeBots || !includeHumans
    const joinClause = needsBotJoin
      ? `LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id`
      : ''

    const queryParams: (string | string[])[] = poolType ? [setCode, since, until, poolType] : [setCode, since, until]
    let tournamentFilter = ''
    if (tournamentOnly) {
      queryParams.push(tournamentUserIds)
      tournamentFilter = `AND cp.user_id = ANY($${queryParams.length}::uuid[])`
    }

    // Top players filter (from top_players table)
    let topPlayersJoin = ''
    if (topPlayersOnly) {
      topPlayersJoin = `JOIN top_players tp ON tp.user_id = cp.user_id`
    }

    // Single user filter
    let userFilter = ''
    if (userId) {
      queryParams.push(userId)
      userFilter = `AND cp.user_id = $${queryParams.length}::uuid`
    }

    const baseWhere = `cp.set_code = $1 AND cp.created_at >= $2 AND cp.created_at < ($3::date + interval '1 day')
          ${poolType ? `AND cp.pool_type = $4` : ''}
          ${botFilter}
          ${tournamentFilter}
          ${userFilter}`

    const extraJoins = `${joinClause} ${topPlayersJoin}`

    // Run count and aggregation queries in parallel.
    // Previously fetched full JSONB card objects (images, text, traits) for every row
    // and processed in JS — caused 30+ second response times.
    // Now pushes aggregation to SQL via CTEs, returning only per-card summary rows.
    const [countResult, cardRows, deckRows] = await Promise.all([
      // Query 1: Count total pool-deck pairs (fast, no JSONB processing)
      queryRow(
        `SELECT COUNT(*) AS total
         FROM card_pools cp
         JOIN built_decks bd ON bd.card_pool_id = cp.id
         ${extraJoins}
         WHERE ${baseWhere}`,
        queryParams
      ),
      // Query 2: Aggregate per-card inclusion stats via SQL CTEs.
      // Step 1: lightweight pool_ids CTE gets matching IDs without touching JSONB.
      // Step 2: pool_cards unnests cp.cards via index lookup on cp.id.
      // Step 3: deck_cards unnests bd.deck via index lookup on bd.card_pool_id.
      // Step 4: LEFT JOIN + GROUP BY produces per-card aggregates.
      queryRows(
        `WITH pool_ids AS (
          SELECT cp.id AS pool_id
          FROM card_pools cp
          JOIN built_decks bd ON bd.card_pool_id = cp.id
          ${joinClause}
          WHERE ${baseWhere}
        ),
        pool_cards AS (
          SELECT DISTINCT
            cp.id AS pool_id,
            CASE
              WHEN position('-' in c->>'cardId') > 0 THEN
                split_part(c->>'cardId', '-', 1) || '_' || lpad(split_part(c->>'cardId', '-', 2), 3, '0')
              WHEN position('_' in c->>'cardId') > 0 THEN
                split_part(c->>'cardId', '_', 1) || '_' || lpad(split_part(c->>'cardId', '_', 2), 3, '0')
              ELSE c->>'cardId'
            END AS norm_id,
            c->>'cardId' AS raw_card_id
          FROM pool_ids pi
          JOIN card_pools cp ON cp.id = pi.pool_id,
          LATERAL jsonb_array_elements(cp.cards) AS c
          WHERE COALESCE(c->>'type', '') NOT IN ('Leader', 'Base')
            AND c->>'isLeader' IS DISTINCT FROM 'true'
            AND c->>'isBase' IS DISTINCT FROM 'true'
            AND c->>'cardId' IS NOT NULL
        ),
        deck_cards AS (
          SELECT
            bd.card_pool_id AS pool_id,
            CASE
              WHEN position('-' in e->>'id') > 0 THEN
                split_part(e->>'id', '-', 1) || '_' || lpad(split_part(e->>'id', '-', 2), 3, '0')
              WHEN position('_' in e->>'id') > 0 THEN
                split_part(e->>'id', '_', 1) || '_' || lpad(split_part(e->>'id', '_', 2), 3, '0')
              ELSE e->>'id'
            END AS norm_id,
            COALESCE((e->>'count')::int, 1) AS copy_count
          FROM pool_ids pi
          JOIN built_decks bd ON bd.card_pool_id = pi.pool_id,
          LATERAL jsonb_array_elements(bd.deck) AS e
          WHERE e->>'id' IS NOT NULL
        )
        SELECT
          pc.norm_id,
          MIN(pc.raw_card_id) AS card_id,
          COUNT(DISTINCT pc.pool_id) AS pools_with_card,
          COUNT(DISTINCT dc.pool_id) AS decks_with_card,
          COALESCE(SUM(dc.copy_count), 0) AS total_copies_in_decks
        FROM pool_cards pc
        LEFT JOIN deck_cards dc ON pc.pool_id = dc.pool_id AND pc.norm_id = dc.norm_id
        GROUP BY pc.norm_id`,
        queryParams
      ),
      // Query 3: Fetch leader/base/deck per built deck for off-aspect computation.
      // Lightweight: only IDs needed, aspects resolved from card cache.
      queryRows(
        `SELECT
          bd.leader->>'id' AS leader_id,
          bd.base->>'id' AS base_id,
          bd.deck AS deck
        FROM card_pools cp
        JOIN built_decks bd ON bd.card_pool_id = cp.id
        ${extraJoins}
        WHERE ${baseWhere}`,
        queryParams
      ),
    ])

    const totalPoolsWithDecks = parseInt(countResult?.total || '0')

    // Merge variants of the same card by canonical name.
    // Pool cards use variant-specific cardIds (e.g., LAW-265 for Hyperspace)
    // while deck cards use base cardIds (e.g., LAW_001 for Normal).
    // Without merging, variants get separate rows with broken deck JOINs.
    const mergedByName = new Map<string, {
      poolsWithCard: number
      decksWithCard: number
      totalCopiesInDecks: number
    }>()

    for (const row of cardRows) {
      const poolsWithCard = parseInt(row.pools_with_card)
      if (poolsWithCard <= 0) continue

      const cardData = cardMap.get(row.norm_id) || cardMap.get(row.card_id)
      const name = cardData?.name || 'Unknown'
      const type = cardData?.type || ''
      const key = `${name}|${type}`

      if (!mergedByName.has(key)) {
        mergedByName.set(key, {
          poolsWithCard,
          decksWithCard: parseInt(row.decks_with_card),
          totalCopiesInDecks: parseInt(row.total_copies_in_decks),
        })
      } else {
        const existing = mergedByName.get(key)!
        existing.poolsWithCard += poolsWithCard
        existing.decksWithCard += parseInt(row.decks_with_card)
        existing.totalCopiesInDecks += parseInt(row.total_copies_in_decks)
      }
    }

    // Compute off-aspect inclusion stats from per-deck data.
    // For each built deck, check which cards are out-of-aspect for that deck's leader+base.
    // Track: how many decks include this card off-aspect, and how many decks total include it.
    const offAspectCounts = new Map<string, { offAspectDecks: number, totalDecks: number }>()

    for (const row of deckRows) {
      const leaderCard = cardMap.get(row.leader_id)
      const baseCard = cardMap.get(row.base_id)
      if (!leaderCard || !baseCard) continue

      const deckCards = Array.isArray(row.deck) ? row.deck : []
      for (const entry of deckCards) {
        const cardId = entry?.id
        if (!cardId) continue
        const card = cardMap.get(cardId)
        if (!card || card.type === 'Leader' || card.type === 'Base') continue

        const nameKey = `${card.name}|${card.type}`
        if (!offAspectCounts.has(nameKey)) {
          offAspectCounts.set(nameKey, { offAspectDecks: 0, totalDecks: 0 })
        }
        const counts = offAspectCounts.get(nameKey)!
        counts.totalDecks++
        if (calculateAspectPenalty(card, leaderCard, baseCard) > 0) {
          counts.offAspectDecks++
        }
      }
    }

    // Enrich merged results with Normal variant card data and compute rates
    const cards = Array.from(mergedByName.entries())
      .map(([key, merged]) => {
        const inclusionRate = merged.poolsWithCard > 0 ? (merged.decksWithCard / merged.poolsWithCard) * 100 : 0
        const avgCopiesPlayed = merged.decksWithCard > 0 ? merged.totalCopiesInDecks / merged.decksWithCard : 0

        const cardData = nameTypeToCard.get(key)

        const ooa = offAspectCounts.get(key)
        const offAspectRate = ooa && ooa.totalDecks > 0
          ? Math.round((ooa.offAspectDecks / ooa.totalDecks) * 1000) / 10
          : 0

        return {
          cardName: cardData?.name || key.split('|')[0],
          cardId: cardData?.cardId || null,
          rarity: cardData?.rarity || 'Unknown',
          cardType: cardData?.type || 'Unknown',
          aspects: cardData?.aspects || [],
          poolsWithCard: merged.poolsWithCard,
          decksWithCard: merged.decksWithCard,
          inclusionRate: Math.round(inclusionRate * 10) / 10,
          avgCopiesPlayed: Math.round(avgCopiesPlayed * 10) / 10,
          offAspectRate,
          subtitle: cardData?.subtitle || null,
          cost: cardData?.cost ?? null,
          imageUrl: cardData?.imageUrl || null,
          backImageUrl: cardData?.backImageUrl || null,
        }
      })
      .sort((a, b) => b.inclusionRate - a.inclusionRate)

    return jsonResponse({
      setCode,
      totalPoolsWithDecks,
      cards,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
