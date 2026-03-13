// @ts-nocheck
// GET /api/stats/deck-inclusion - Get deck inclusion metrics per card
import { queryRows, queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
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

    // Build card lookup map for enrichment, keyed by both CMS id and normalized cardId
    const allCards = getAllCards()
    const cardMap = new Map()
    allCards.forEach(card => {
      cardMap.set(card.id, card)
      if (card.cardId) {
        const [set, num] = card.cardId.split('-')
        if (set && num) {
          cardMap.set(`${set}_${num.padStart(3, '0')}`, card)
          cardMap.set(card.cardId, card)
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
    const [countResult, cardRows] = await Promise.all([
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
    ])

    const totalPoolsWithDecks = parseInt(countResult?.total || '0')

    // Enrich with card data from cache and compute rates
    const cards = cardRows
      .filter(row => parseInt(row.pools_with_card) > 0)
      .map(row => {
        const poolsWithCard = parseInt(row.pools_with_card)
        const decksWithCard = parseInt(row.decks_with_card)
        const totalCopiesInDecks = parseInt(row.total_copies_in_decks)
        const inclusionRate = poolsWithCard > 0 ? (decksWithCard / poolsWithCard) * 100 : 0
        const avgCopiesPlayed = decksWithCard > 0 ? totalCopiesInDecks / decksWithCard : 0

        // Look up card data for enrichment (try normalized ID first, then raw)
        const cardData = cardMap.get(row.norm_id) || cardMap.get(row.card_id)

        return {
          cardName: cardData?.name || 'Unknown',
          cardId: row.card_id,
          rarity: cardData?.rarity || 'Unknown',
          cardType: cardData?.type || 'Unknown',
          aspects: cardData?.aspects || [],
          poolsWithCard,
          decksWithCard,
          inclusionRate: Math.round(inclusionRate * 10) / 10,
          avgCopiesPlayed: Math.round(avgCopiesPlayed * 10) / 10,
          subtitle: cardData?.subtitle || null,
          cost: cardData?.cost ?? null,
          imageUrl: cardData?.imageUrl || null,
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
