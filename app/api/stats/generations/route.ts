// @ts-nocheck
// GET /api/stats/generations - Get card generation statistics
import { queryRows } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { statCacheGet, statCacheSet } from '@/lib/statCache'
import { analyzeCardStats, getSetReferenceData } from '@/src/utils/statsCalculations'
import { getAllCards } from '@/src/utils/cardData'
import { NextRequest, NextResponse } from 'next/server'

const CACHE_CONTROL = 'public, s-maxage=900, stale-while-revalidate=3600'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const since = url.searchParams.get('since') || '2020-01-01'

    // Served from a shared in-process cache when warm (~10 full scans over 2.3M rows otherwise).
    const cacheKey = `generations:${setCode}:${since}`
    const cachedPayload = statCacheGet(cacheKey)
    if (cachedPayload) {
      const r = jsonResponse(cachedPayload)
      r.headers.set('Cache-Control', CACHE_CONTROL)
      return r
    }

    // Get all cards
    const allCards = getAllCards()

    // Get all generations for this set since the specified date
    const generations = await queryRows(
      `SELECT
        card_id,
        card_name,
        card_subtitle,
        card_type,
        rarity,
        aspects,
        treatment,
        COUNT(*) as count
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY card_id, card_name, card_subtitle, card_type, rarity, aspects, treatment
       ORDER BY card_id, treatment`,
      [setCode, since]
    )

    // Get comprehensive statistics
    const statsResult = await queryRows(
      `SELECT
        COUNT(DISTINCT source_id) FILTER (WHERE source_type = 'draft') as draft_pools,
        COUNT(DISTINCT source_id) FILTER (WHERE source_type = 'sealed') as sealed_pools,
        COUNT(*) as total_cards,
        COUNT(*) / 16 as estimated_packs
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2`,
      [setCode, since]
    )

    // === POOL-LEVEL METRICS ===
    // Get pool-level data for QA validation
    // Note: pack_index is not tracked, so we analyze at pool level

    // 1. Count pools by type
    const poolCounts = await queryRows(
      `SELECT source_type, COUNT(DISTINCT source_id) as pool_count
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY source_type`,
      [setCode, since]
    )

    // 2. Treatment distribution across all cards
    const treatmentDistribution = await queryRows(
      `SELECT treatment, COUNT(*) as count
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY treatment
       ORDER BY count DESC`,
      [setCode, since]
    )

    // 3. Rarity distribution
    const rarityDistribution = await queryRows(
      `SELECT rarity, COUNT(*) as count
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY rarity
       ORDER BY count DESC`,
      [setCode, since]
    )

    // 4. Cards per pool (should be ~96 for sealed, ~384 for draft)
    const cardsPerPool = await queryRows(
      `SELECT source_type, source_id, COUNT(*) as card_count
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY source_type, source_id
       ORDER BY card_count`,
      [setCode, since]
    )

    // 5. Legendary count per pool
    const legendariesPerPool = await queryRows(
      `SELECT source_type, source_id, COUNT(*) as legendary_count
       FROM card_generations
       WHERE set_code = $1 AND rarity = 'Legendary' AND generated_at >= $2
       GROUP BY source_type, source_id`,
      [setCode, since]
    )

    // 6. Same-treatment duplicates within a pool (same card name + treatment appearing multiple times)
    // For sealed (6 packs), some duplicates are expected. For validation, we look for excessive duplicates.
    const sameTreatmentDuplicates = await queryRows(
      `SELECT source_type, source_id, card_name, card_subtitle, treatment, COUNT(*) as duplicate_count
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY source_type, source_id, card_name, card_subtitle, treatment
       HAVING COUNT(*) > 1
       ORDER BY duplicate_count DESC
       LIMIT 50`,
      [setCode, since]
    )

    // 7. Cross-treatment duplicates within a pool (same card appearing with different treatments)
    // This is expected and interesting to track (e.g., normal + foil of same card)
    const crossTreatmentDuplicates = await queryRows(
      `SELECT source_type, source_id, card_name, card_subtitle,
              array_agg(DISTINCT treatment ORDER BY treatment) as treatments,
              COUNT(DISTINCT treatment) as treatment_count,
              COUNT(*) as total_appearances
       FROM card_generations
       WHERE set_code = $1 AND generated_at >= $2
       GROUP BY source_type, source_id, card_name, card_subtitle
       HAVING COUNT(DISTINCT treatment) > 1
       ORDER BY treatment_count DESC, total_appearances DESC
       LIMIT 50`,
      [setCode, since]
    )

    // 8. Count pools with any same-treatment duplicates
    const poolsWithSameTreatmentDupes = await queryRows(
      `SELECT COUNT(DISTINCT source_id) as pool_count
       FROM (
         SELECT source_id
         FROM card_generations
         WHERE set_code = $1 AND generated_at >= $2
         GROUP BY source_id, card_name, card_subtitle, treatment
         HAVING COUNT(*) > 1
       ) as dupes`,
      [setCode, since]
    )

    // 9. Count pools with cross-treatment duplicates
    const poolsWithCrossTreatmentDupes = await queryRows(
      `SELECT COUNT(DISTINCT source_id) as pool_count
       FROM (
         SELECT source_id
         FROM card_generations
         WHERE set_code = $1 AND generated_at >= $2
         GROUP BY source_id, card_name, card_subtitle
         HAVING COUNT(DISTINCT treatment) > 1
       ) as dupes`,
      [setCode, since]
    )

    // Calculate average legendaries per pool type
    const sealedLegendaries = legendariesPerPool.filter(p => p.source_type === 'sealed')
    const draftLegendaries = legendariesPerPool.filter(p => p.source_type === 'draft')
    const avgSealedLegendaries = sealedLegendaries.length > 0
      ? sealedLegendaries.reduce((sum, p) => sum + parseInt(p.legendary_count), 0) / sealedLegendaries.length
      : 0
    const avgDraftLegendaries = draftLegendaries.length > 0
      ? draftLegendaries.reduce((sum, p) => sum + parseInt(p.legendary_count), 0) / draftLegendaries.length
      : 0

    // Calculate total pools for percentage
    const totalPools_metric = Object.values(poolCounts.reduce((acc, row) => {
      acc[row.source_type] = parseInt(row.pool_count)
      return acc
    }, {})).reduce((a, b) => a + b, 0)

    // === PACK-LEVEL METRICS ===
    // Only available for data with pack_index tracked

    // 10. Count packs with pack_index
    const packsWithIndex = await queryRows(
      `SELECT COUNT(DISTINCT (source_id, pack_index)) as pack_count
       FROM card_generations
       WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2`,
      [setCode, since]
    )
    const totalPacksWithIndex = parseInt(packsWithIndex[0]?.pack_count || 0)

    // 11. Same-treatment duplicates at PACK level (should be 0)
    const packSameTreatmentDuplicates = await queryRows(
      `SELECT source_id, pack_index, card_name, card_subtitle, treatment, COUNT(*) as duplicate_count
       FROM card_generations
       WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
       GROUP BY source_id, pack_index, card_name, card_subtitle, treatment
       HAVING COUNT(*) > 1
       ORDER BY duplicate_count DESC
       LIMIT 20`,
      [setCode, since]
    )

    // 12. Count packs with same-treatment duplicates (should be 0)
    const packsWithSameTreatmentDupes = await queryRows(
      `SELECT COUNT(DISTINCT (source_id, pack_index)) as pack_count
       FROM (
         SELECT source_id, pack_index
         FROM card_generations
         WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
         GROUP BY source_id, pack_index, card_name, card_subtitle, treatment
         HAVING COUNT(*) > 1
       ) as dupes`,
      [setCode, since]
    )

    // 13. Cross-treatment duplicates at PACK level (expected ~7-8% - card+foil pairs)
    const packCrossTreatmentDuplicates = await queryRows(
      `SELECT source_id, pack_index, card_name, card_subtitle,
              array_agg(DISTINCT treatment ORDER BY treatment) as treatments
       FROM card_generations
       WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
       GROUP BY source_id, pack_index, card_name, card_subtitle
       HAVING COUNT(DISTINCT treatment) > 1
       ORDER BY source_id, pack_index
       LIMIT 20`,
      [setCode, since]
    )

    // 14. Count packs with cross-treatment duplicates
    const packsWithCrossTreatmentDupes = await queryRows(
      `SELECT COUNT(DISTINCT (source_id, pack_index)) as pack_count
       FROM (
         SELECT source_id, pack_index
         FROM card_generations
         WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
         GROUP BY source_id, pack_index, card_name, card_subtitle
         HAVING COUNT(DISTINCT treatment) > 1
       ) as dupes`,
      [setCode, since]
    )

    const packMetrics = {
      // Pool-level metrics
      poolCounts: poolCounts.reduce((acc, row) => {
        acc[row.source_type] = parseInt(row.pool_count)
        return acc
      }, {}),
      treatmentDistribution: treatmentDistribution.reduce((acc, row) => {
        acc[row.treatment] = parseInt(row.count)
        return acc
      }, {}),
      rarityDistribution: rarityDistribution.reduce((acc, row) => {
        acc[row.rarity] = parseInt(row.count)
        return acc
      }, {}),
      // Pool-level duplicates
      poolSameTreatmentDuplicates: {
        poolsAffected: parseInt(poolsWithSameTreatmentDupes[0]?.pool_count || 0),
        totalPools: totalPools_metric,
        samples: sameTreatmentDuplicates.slice(0, 5).map(d => ({
          card: d.card_subtitle ? `${d.card_name} - ${d.card_subtitle}` : d.card_name,
          treatment: d.treatment,
          count: parseInt(d.duplicate_count)
        }))
      },
      poolCrossTreatmentDuplicates: {
        poolsAffected: parseInt(poolsWithCrossTreatmentDupes[0]?.pool_count || 0),
        totalPools: totalPools_metric,
        samples: crossTreatmentDuplicates.slice(0, 5).map(d => ({
          card: d.card_subtitle ? `${d.card_name} - ${d.card_subtitle}` : d.card_name,
          treatments: d.treatments
        }))
      },
      // Pack-level metrics (only for data with pack_index)
      totalPacksTracked: totalPacksWithIndex,
      packSameTreatmentDuplicates: {
        packsAffected: parseInt(packsWithSameTreatmentDupes[0]?.pack_count || 0),
        totalPacks: totalPacksWithIndex,
        expected: 0,
        samples: packSameTreatmentDuplicates.slice(0, 5).map(d => ({
          card: d.card_subtitle ? `${d.card_name} - ${d.card_subtitle}` : d.card_name,
          treatment: d.treatment,
          count: parseInt(d.duplicate_count)
        }))
      },
      packCrossTreatmentDuplicates: {
        packsAffected: parseInt(packsWithCrossTreatmentDupes[0]?.pack_count || 0),
        totalPacks: totalPacksWithIndex,
        expectedPercent: 8, // ~7-8% of packs expected to have card+foil pair
        samples: packCrossTreatmentDuplicates.slice(0, 5).map(d => ({
          card: d.card_subtitle ? `${d.card_name} - ${d.card_subtitle}` : d.card_name,
          treatments: d.treatments
        }))
      }
    }
    const stats = statsResult[0] || { draft_pools: 0, sealed_pools: 0, total_cards: 0, estimated_packs: 0 }
    const totalPacks = parseInt(stats.estimated_packs) || 0
    const totalPools = parseInt(stats.draft_pools || 0) + parseInt(stats.sealed_pools || 0)

    // Group generations by card NAME (merging all variants: Normal, Hyperspace, Showcase)
    // This way each card has one row, with columns for each treatment type
    const cardStats = {}
    generations.forEach(row => {
      // Create a unique key based on card name and subtitle (not card_id, since variants have different IDs)
      const cardKey = row.card_subtitle ? `${row.card_name}|${row.card_subtitle}` : row.card_name

      if (!cardStats[cardKey]) {
        // Extract the base card number from card_id (e.g., "SOR-059" from "SOR-059" or "SOR-324")
        // We'll use the Normal variant's ID for display, found below
        cardStats[cardKey] = {
          cardId: row.card_id, // Will be updated to Normal variant ID if found
          name: row.card_name,
          subtitle: row.card_subtitle,
          type: row.card_type,
          rarity: row.rarity,
          aspects: row.aspects || [],
          treatments: {}
        }
      }
      // Accumulate counts for each treatment (base, hyperspace, foil, etc.)
      const currentCount = cardStats[cardKey].treatments[row.treatment] || 0
      cardStats[cardKey].treatments[row.treatment] = currentCount + parseInt(row.count)
    })

    // Analyze each card's statistics
    const analyzedCards = []
    const unmatchedCards = []
    for (const cardKey in cardStats) {
      const cardData = cardStats[cardKey]

      // Find the Normal variant card object from cache (for expected value calculations)
      // Normalize subtitle comparison (null/undefined/empty string all treated as empty)
      const normalCard = allCards.find(c =>
        c.name === cardData.name &&
        (c.subtitle || '') === (cardData.subtitle || '') &&
        c.variantType === 'Normal'
      )

      if (!normalCard) {
        // Track unmatched cards for debugging
        unmatchedCards.push({
          cardKey,
          name: cardData.name,
          treatments: cardData.treatments
        })
        continue
      }

      // Use the Normal variant's ID for display
      cardData.cardId = normalCard.id

      const analysis = analyzeCardStats(normalCard, cardData.treatments, totalPacks, setCode)

      analyzedCards.push({
        ...cardData,
        analysis
      })
    }

    // Log unmatched cards if any (helps debug Hyperspace issues)
    if (unmatchedCards.length > 0) {
      console.warn(`[STATS] ${unmatchedCards.length} cards in generations not found in card data:`,
        unmatchedCards.slice(0, 5).map(c => `${c.cardId} (${c.name})`).join(', '))
    }

    // Get reference data
    const referenceData = getSetReferenceData(setCode)

    // Debug: count cards by treatment in the raw data
    const treatmentCounts = {}
    generations.forEach(row => {
      treatmentCounts[row.treatment] = (treatmentCounts[row.treatment] || 0) + parseInt(row.count)
    })

    // Debug: count cards by variantType in the card cache
    const cardCacheVariantCounts = {}
    const setCards = allCards.filter(c => c.set === setCode)
    setCards.forEach(c => {
      const vt = c.variantType || 'unknown'
      cardCacheVariantCounts[vt] = (cardCacheVariantCounts[vt] || 0) + 1
    })

    const payload = {
      setCode,
      totalPacks,
      totalPools,
      draftPools: parseInt(stats.draft_pools || 0),
      sealedPools: parseInt(stats.sealed_pools || 0),
      totalCards: parseInt(stats.total_cards || 0),
      cards: analyzedCards,
      packMetrics,
      reference: referenceData,
      generatedAt: new Date().toISOString(),
      // Debug info to help diagnose Hyperspace issues
      debug: {
        rawGenerationsCount: generations.length,
        treatmentCounts,
        cardCacheVariantCounts,
        totalCardsInCache: setCards.length,
        unmatchedCardsCount: unmatchedCards.length,
        unmatchedSamples: unmatchedCards.slice(0, 10)
      }
    }
    // Expensive (~10 full scans over 2.3M rows) and changes slowly — cache the result
    // so only the first request per TTL pays the cost. See the QA caching note in the
    // duplicate-rate research doc; keep warm with `npm run qa-warm`.
    statCacheSet(cacheKey, payload)
    const response = jsonResponse(payload)
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    console.error('Error fetching generation stats:', error)
    return handleApiError(error)
  }
}
