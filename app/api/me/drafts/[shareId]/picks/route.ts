// @ts-nocheck
// GET /api/me/drafts/:shareId/picks - Get user's picks from a draft
import { queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
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
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { shareId } = await params

    // Get draft pod
    const pod = await queryRow(
      `SELECT dp.id, dp.share_id, dp.set_code, dp.set_name, dp.status,
              dp.started_at, dp.completed_at
       FROM pods dp
       JOIN pod_players dpp ON dp.id = dpp.pod_id
       WHERE dp.share_id = $1 AND dpp.user_id = $2
         AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`,
      [shareId, session.id]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Get user's picks
    const picks = await queryRows(
      `SELECT card_id, card_name, set_code, rarity, card_type, variant_type,
              is_leader, pack_number, pick_in_pack, pick_number, leader_round
       FROM draft_picks
       WHERE pod_id = $1 AND user_id = $2
       ORDER BY pick_number`,
      [pod.id, session.id]
    )

    // Build card lookup for enrichment (indexes by id, cardId, and normalized cardId)
    const allCards = getAllCards()
    const { cardMap: cardLookup } = buildCardLookupMaps(allCards)

    // Separate leader picks from card picks
    const cardPicks = []
    const leaderPicks = []

    for (const pick of picks) {
      const card = cardLookup.get(pick.card_id)

      const base = {
        id: pick.card_id,
        number: card?.cardId || pick.card_id,
        title: card?.name || pick.card_name,
        subtitle: card?.subtitle || null,
        rarity: pick.rarity,
        type: pick.card_type,
        aspects: card?.aspects || [],
        cost: card?.cost ?? null,
        treatment: determineTreatment(card, pick.variant_type),
      }

      if (pick.is_leader) {
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
        shareId: pod.share_id,
        setCode: pod.set_code,
        setName: pod.set_name,
        status: pod.status,
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
