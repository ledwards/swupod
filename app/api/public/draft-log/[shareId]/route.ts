// @ts-nocheck
/**
 * GET /api/public/draft-log/:shareId - Public anonymized draft log
 *
 * Returns anonymized draft pick data for community analysis.
 * Only works when the draft pod has is_log_public = true.
 * Rate limited to 60 requests/minute per IP.
 */
import { queryRow, queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps } from '@/src/utils/cardNormalization'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

function determineTreatment(card: any, variantType: string | null): string {
  if (!card) return variantType || 'Normal'
  if (card.isShowcase || variantType === 'Showcase') return 'Showcase'
  if ((card.isHyperspace || variantType === 'Hyperspace') && card.isFoil) return 'Hyperspace Foil'
  if (card.isHyperspace || variantType === 'Hyperspace') return 'Hyperspace'
  if (card.isFoil || variantType === 'Foil') return 'Foil'
  return 'Normal'
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    // Rate limit check
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const { shareId } = await params

    // Load draft pod
    const pod = await queryRow(
      `SELECT dp.id, dp.share_id, dp.status, dp.set_code, dp.set_name,
              dp.is_log_public, dp.started_at, dp.completed_at
       FROM pods dp
       WHERE dp.share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.status !== 'complete') {
      return errorResponse('Draft is not complete yet', 400)
    }

    if (!pod.is_log_public) {
      return errorResponse('This draft log is not public', 403)
    }

    // Get seat mapping (user_id -> seat_number)
    const players = await queryRows(
      `SELECT user_id, seat_number, is_bot
       FROM pod_players
       WHERE pod_id = $1
       ORDER BY seat_number`,
      [pod.id]
    )

    const seatMap = new Map<string, number>()
    for (const p of players) {
      seatMap.set(p.user_id, p.seat_number)
    }

    // Get all picks from draft_picks table
    const picks = await queryRows(
      `SELECT card_id, card_name, set_code, rarity, card_type, variant_type,
              is_leader, pack_number, pick_in_pack, pick_number, leader_round, user_id
       FROM draft_picks
       WHERE pod_id = $1
       ORDER BY user_id, pick_number`,
      [pod.id]
    )

    // Build card lookup for enrichment (indexes by id, cardId, and normalized cardId)
    const allCards = getAllCards()
    const { cardMap: cardLookup } = buildCardLookupMaps(allCards)

    // Separate leader picks from card picks
    const cardPicks = []
    const leaderPicks = []

    for (const pick of picks) {
      const seat = seatMap.get(pick.user_id) || 0
      const card = cardLookup.get(pick.card_id)

      const base = {
        seat,
        id: pick.card_id,
        number: card?.cardId || pick.card_id,
        title: card?.name || pick.card_name,
        subtitle: card?.subtitle || null,
        rarity: card?.rarity || pick.rarity,
        type: card?.type || pick.card_type,
        aspects: card?.aspects || [],
        cost: card?.cost ?? null,
        treatment: determineTreatment(card, pick.variant_type),
      }

      if (card?.isLeader || pick.is_leader) {
        leaderPicks.push({
          ...base,
          leaderRound: pick.leader_round,
        })
      } else {
        cardPicks.push({
          ...base,
          packNumber: pick.pack_number,
          pickInPack: pick.pick_in_pack,
          pickNumber: pick.pick_number,
        })
      }
    }

    return jsonResponse({
      draft: {
        setCode: pod.set_code,
        setName: pod.set_name,
        totalSeats: players.length,
        startedAt: pod.started_at,
        completedAt: pod.completed_at,
      },
      leaderPicks,
      picks: cardPicks,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
