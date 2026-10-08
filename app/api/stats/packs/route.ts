// @ts-nocheck
// GET /api/stats/packs - Get generated packs with card images
import { queryRows } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { getAllCards } from '@/src/utils/cardData'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const setCode = url.searchParams.get('setCode') || 'SOR'
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const since = url.searchParams.get('since') || '2020-01-01'

    // Get all cards for image lookup
    const allCards = getAllCards()
    const cardMap = new Map()
    allCards.forEach(card => {
      // Map by card_id and also by name+subtitle for fallback
      cardMap.set(card.id, card)
      const key = card.subtitle ? `${card.name}|${card.subtitle}` : card.name
      if (!cardMap.has(key)) {
        cardMap.set(key, card)
      }
    })

    // Get unique packs with pack_index
    const packList = await queryRows(
      `SELECT DISTINCT source_id, source_type, pack_index, generated_at
       FROM card_generations
       WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $4
       ORDER BY generated_at DESC, source_id, pack_index
       LIMIT $2 OFFSET $3`,
      [setCode, limit, offset, since]
    )

    // Get total count
    const countResult = await queryRows(
      `SELECT COUNT(DISTINCT (source_id, pack_index)) as total
       FROM card_generations
       WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2`,
      [setCode, since]
    )
    const totalPacks = parseInt(countResult[0]?.total || 0)

    // Get cards for each pack
    const packs = []
    for (const pack of packList) {
      const packCards = await queryRows(
        `SELECT card_id, card_name, card_subtitle, card_type, rarity, aspects, treatment
         FROM card_generations
         WHERE source_id = $1 AND pack_index = $2 AND set_code = $3
         ORDER BY id`,
        [pack.source_id, pack.pack_index, setCode]
      )

      // Enrich with image URLs
      const enrichedCards = packCards.map(card => {
        // Try to find the card in the card map
        let cardData = cardMap.get(card.card_id)

        // If not found, try by name+subtitle
        if (!cardData) {
          const key = card.card_subtitle ? `${card.card_name}|${card.card_subtitle}` : card.card_name
          cardData = cardMap.get(key)
        }

        return {
          cardId: card.card_id,
          name: card.card_name,
          subtitle: card.card_subtitle,
          type: card.card_type,
          rarity: card.rarity,
          aspects: card.aspects || [],
          treatment: card.treatment,
          imageUrl: cardData?.frontArt || cardData?.imageUrl || null,
          isFoil: card.treatment === 'foil' || card.treatment === 'hyperspace_foil',
          isHyperspace: card.treatment === 'hyperspace' || card.treatment === 'hyperspace_foil',
          isShowcase: card.treatment === 'showcase'
        }
      })

      packs.push({
        sourceId: pack.source_id,
        sourceType: pack.source_type,
        packIndex: pack.pack_index,
        createdAt: pack.generated_at,
        cards: enrichedCards
      })
    }

    return jsonResponse({
      setCode,
      packs,
      total: totalPacks,
      limit,
      offset,
      hasMore: offset + packs.length < totalPacks
    })
  } catch (error) {
    console.error('Error fetching pack stats:', error)
    return handleApiError(error)
  }
}
