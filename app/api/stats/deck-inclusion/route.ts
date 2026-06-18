// @ts-nocheck
// GET /api/stats/deck-inclusion - Get deck inclusion metrics per card
import { queryRows, queryRow } from '@/lib/db'
import { cachedAggregate, STATS_AGGREGATE_TTL_MS } from '@/lib/queryCache'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps, cardIdentityKey } from '@/src/utils/cardNormalization'
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
    const includeBots = url.searchParams.get('includeBots') === 'true'
    const includeHumans = url.searchParams.get('includeHumans') !== 'false'
    const tournamentOnly = url.searchParams.get('tournamentOnly') === 'true'
    const topPlayersOnly = url.searchParams.get('topPlayersOnly') === 'true'
    const userId = url.searchParams.get('userId') || null

    // Build card lookup maps — all variants merge to same card via name|type|subtitle key
    // See src/utils/cardNormalization.ts for the canonical normalization pattern
    const allCards = getAllCards()
    const { cardMap, normalCardMap } = buildCardLookupMaps(allCards)

    // Bots are NEVER counted in stats — always exclude. Sealed pools have no
    // pod_players entry (is_bot IS NULL), so those stay as human.
    const botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`
    const joinClause = `LEFT JOIN pod_players dpp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id`

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

    const baseWhere = `($1 = 'all' OR cp.set_code = $1) AND cp.created_at >= $2 AND cp.created_at < ($3::date + interval '1 day')
          ${poolType ? `AND cp.pool_type = $4` : ''}
          ${botFilter}
          ${tournamentFilter}
          ${userFilter}`

    const extraJoins = `${joinClause} ${topPlayersJoin}`

    // Run count and aggregation queries in parallel.
    // Previously fetched full JSONB card objects (images, text, traits) for every row
    // and processed in JS — caused 30+ second response times.
    // Now pushes aggregation to SQL via CTEs, returning only per-card summary rows.
    const [countResult, cardRows, deckRows] = await cachedAggregate(
      `deck-inclusion:${url.search}`,
      STATS_AGGREGATE_TTL_MS,
      () => Promise.all([
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
              WHEN position('-' in COALESCE(e->>'id', e->>'cardId')) > 0 THEN
                split_part(COALESCE(e->>'id', e->>'cardId'), '-', 1) || '_' || lpad(split_part(COALESCE(e->>'id', e->>'cardId'), '-', 2), 3, '0')
              WHEN position('_' in COALESCE(e->>'id', e->>'cardId')) > 0 THEN
                split_part(COALESCE(e->>'id', e->>'cardId'), '_', 1) || '_' || lpad(split_part(COALESCE(e->>'id', e->>'cardId'), '_', 2), 3, '0')
              ELSE COALESCE(e->>'id', e->>'cardId')
            END AS norm_id,
            COALESCE((e->>'count')::int, 1) AS copy_count
          FROM pool_ids pi
          JOIN built_decks bd ON bd.card_pool_id = pi.pool_id,
          LATERAL jsonb_array_elements(bd.deck) AS e
          WHERE COALESCE(e->>'id', e->>'cardId') IS NOT NULL
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
          bd.leader->>'cardId' AS leader_card_id,
          bd.base->>'id' AS base_id,
          bd.base->>'cardId' AS base_card_id,
          bd.deck AS deck
        FROM card_pools cp
        JOIN built_decks bd ON bd.card_pool_id = cp.id
        ${extraJoins}
        WHERE ${baseWhere}`,
        queryParams
      ),
      ]),
    )

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
      const key = cardData ? cardIdentityKey(cardData) : 'Unknown|'

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

    // Helper: look up a card by id, falling back to cardId (display format)
    const resolveCard = (id: string | null, cardId: string | null) =>
      (id && cardMap.get(id)) || (cardId && cardMap.get(cardId)) || null

    for (const row of deckRows) {
      const leaderCard = resolveCard(row.leader_id, row.leader_card_id)
      const baseCard = resolveCard(row.base_id, row.base_card_id)
      if (!leaderCard || !baseCard) continue

      const deckCards = Array.isArray(row.deck) ? row.deck : []
      for (const entry of deckCards) {
        const card = resolveCard(entry?.id, entry?.cardId)
        if (!card || card.type === 'Leader' || card.type === 'Base') continue

        const nameKey = cardIdentityKey(card)
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

    // Compute leader synergy: for each card, how much more/less popular is it
    // in decks with a specific leader vs overall?
    // Per-leader: total copies of card across all decks with that leader / number of decks with that leader
    // Overall: total copies of card across all decks / total decks
    // Synergy delta = per-leader rate - overall rate (positive = high synergy)
    const leaderDeckCounts = new Map<string, number>() // leaderKey -> total decks
    const leaderCardCopies = new Map<string, Map<string, number>>() // leaderKey -> cardKey -> total copies
    const overallCardCopies = new Map<string, number>() // cardKey -> total copies across all decks
    let totalDecksForSynergy = 0

    for (const row of deckRows) {
      const leaderCard = resolveCard(row.leader_id, row.leader_card_id)
      if (!leaderCard) continue

      const leaderKey = cardIdentityKey(leaderCard)
      leaderDeckCounts.set(leaderKey, (leaderDeckCounts.get(leaderKey) || 0) + 1)
      totalDecksForSynergy++

      if (!leaderCardCopies.has(leaderKey)) {
        leaderCardCopies.set(leaderKey, new Map())
      }
      const leaderCards = leaderCardCopies.get(leaderKey)!

      const deckCards = Array.isArray(row.deck) ? row.deck : []
      for (const entry of deckCards) {
        const card = resolveCard(entry?.id, entry?.cardId)
        if (!card || card.type === 'Leader' || card.type === 'Base') continue

        const ck = cardIdentityKey(card)
        const copies = entry?.count || 1
        leaderCards.set(ck, (leaderCards.get(ck) || 0) + copies)
        overallCardCopies.set(ck, (overallCardCopies.get(ck) || 0) + copies)
      }
    }

    // For each leader, compute top 5 synergy cards
    // synergy = (copies in leader decks / leader deck count) - (copies overall / total decks)
    const leaderSynergies = new Map<string, { cardKey: string; cardName: string; synergy: number }[]>()
    for (const [leaderKey, cardCopies] of leaderCardCopies) {
      const leaderCount = leaderDeckCounts.get(leaderKey) || 1
      const synergies: { cardKey: string; cardName: string; synergy: number }[] = []

      for (const [ck, copies] of cardCopies) {
        const leaderRate = copies / leaderCount
        const overallRate = (overallCardCopies.get(ck) || 0) / totalDecksForSynergy
        const synergy = leaderRate - overallRate
        const cardData = normalCardMap.get(ck)
        synergies.push({ cardKey: ck, cardName: cardData?.name || ck.split('|')[0], synergy })
      }

      synergies.sort((a, b) => b.synergy - a.synergy)
      leaderSynergies.set(leaderKey, synergies.slice(0, 5))
    }

    // For each card, find top 3 leaders it's most synergistic with
    const cardTopLeaders = new Map<string, { leaderName: string; synergy: number }[]>()
    for (const [leaderKey, cardCopies] of leaderCardCopies) {
      const leaderCount = leaderDeckCounts.get(leaderKey) || 1
      const leaderData = normalCardMap.get(leaderKey)
      const leaderName = leaderData?.name || leaderKey.split('|')[0]

      for (const [ck, copies] of cardCopies) {
        const leaderRate = copies / leaderCount
        const overallRate = (overallCardCopies.get(ck) || 0) / totalDecksForSynergy
        const synergy = leaderRate - overallRate

        if (!cardTopLeaders.has(ck)) cardTopLeaders.set(ck, [])
        cardTopLeaders.get(ck)!.push({ leaderName, synergy })
      }
    }
    // Sort and keep top 3 per card
    for (const [ck, leaders] of cardTopLeaders) {
      leaders.sort((a, b) => b.synergy - a.synergy)
      cardTopLeaders.set(ck, leaders.slice(0, 3))
    }

    // Enrich merged results with Normal variant card data and compute rates
    const cards = Array.from(mergedByName.entries())
      .map(([key, merged]) => {
        const inclusionRate = merged.poolsWithCard > 0 ? (merged.decksWithCard / merged.poolsWithCard) * 100 : 0
        const avgCopiesPlayed = merged.decksWithCard > 0 ? merged.totalCopiesInDecks / merged.decksWithCard : 0

        const cardData = normalCardMap.get(key)

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
          topLeaders: (cardTopLeaders.get(key) || []).map(l => ({
            leaderName: l.leaderName,
            synergy: Math.round(l.synergy * 100) / 100,
          })),
          subtitle: cardData?.subtitle || null,
          cost: cardData?.cost ?? null,
          imageUrl: cardData?.imageUrl || null,
          backImageUrl: cardData?.backImageUrl || null,
        }
      })
      .sort((a, b) => b.inclusionRate - a.inclusionRate)

    // Build leader synergy summaries for the response
    const leaderSynergySummaries = Array.from(leaderSynergies.entries()).map(([leaderKey, synCards]) => {
      const leaderData = normalCardMap.get(leaderKey)
      return {
        leaderName: leaderData?.name || leaderKey.split('|')[0],
        leaderSubtitle: leaderData?.subtitle || null,
        leaderImageUrl: leaderData?.imageUrl || null,
        deckCount: leaderDeckCounts.get(leaderKey) || 0,
        topSynergyCards: synCards.map(s => ({
          cardName: s.cardName,
          synergy: Math.round(s.synergy * 100) / 100,
        })),
      }
    }).filter(l => l.deckCount >= 3) // Only leaders with enough data
      .sort((a, b) => b.deckCount - a.deckCount)

    const response = jsonResponse({
      setCode,
      totalPoolsWithDecks,
      cards,
      leaderSynergies: leaderSynergySummaries,
    })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
