// POST /api/draft/:shareId/pick - Make a draft pick
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { checkAndAdvanceLeaderDraft, checkAndAdvancePackDraft } from '@/src/utils/draftAdvance'
import { processBotTurns } from '@/src/utils/botLogic'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { attributePickedCard } from '@/src/utils/trackGeneration'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)
    const body = await parseBody(request)

    const cardId = (body as { cardId?: string }).cardId
    if (!cardId) {
      return errorResponse('cardId is required', 400)
    }

    // Get draft pod
    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.status !== 'active') {
      return errorResponse('Draft is not active', 400)
    }

    const podId = pod.id as string

    // Get current player
    const player = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [podId, session.id]
    )

    if (!player) {
      return errorResponse('Not in this draft', 400)
    }

    if (player.pick_status !== 'picking') {
      return errorResponse('Not your turn to pick', 400)
    }

    // Parse draft state
    const draftState = typeof pod.draft_state === 'string'
      ? JSON.parse(pod.draft_state)
      : pod.draft_state

    // Leader preview is look-only — picking opens when the draft starts.
    // Mirrors the guard in select/route.ts. Without it a pick landing in this
    // phase matches neither branch below and returns 'Pick successful' having
    // done nothing at all.
    if (draftState.phase === 'leader_preview') {
      return errorResponse("Draft hasn't started yet", 400)
    }

    type PickCard = {
      id?: string; instanceId?: string; name?: string; set?: string; rarity?: string
      type?: string; variantType?: string; pickNumber?: number; leaderRound?: number
      packNumber?: number; pickInPack?: number
    }

    // Parse player's current pack/leaders
    const currentPack = typeof player.current_pack === 'string'
      ? JSON.parse(player.current_pack)
      : player.current_pack || []

    const leaders = typeof player.leaders === 'string'
      ? JSON.parse(player.leaders)
      : player.leaders || []

    const draftedCards = typeof player.drafted_cards === 'string'
      ? JSON.parse(player.drafted_cards)
      : player.drafted_cards || []

    const draftedLeaders = typeof player.drafted_leaders === 'string'
      ? JSON.parse(player.drafted_leaders)
      : player.drafted_leaders || []

    // Handle based on phase
    if (draftState.phase === 'leader_draft') {
      // Find the leader in available leaders
      // Use instanceId if available (new drafts), fall back to id for backwards compatibility
      const leaderIndex = (leaders as PickCard[]).findIndex(l =>
        (l.instanceId && l.instanceId === cardId) || (!l.instanceId && l.id === cardId)
      )
      if (leaderIndex === -1) {
        console.error('[PICK] Leader not found. cardId:', cardId, 'available leaders:', (leaders as PickCard[]).map(l => ({ id: l.id, instanceId: l.instanceId, name: l.name })))
        return errorResponse('Leader not available', 400)
      }

      // Pick the leader
      const pickedLeader = leaders[leaderIndex]
      const remainingLeaders = (leaders as PickCard[]).filter((_, i) => i !== leaderIndex)

      // Add pick metadata
      const leaderRound = draftState.leaderRound || 1
      pickedLeader.pickNumber = draftedLeaders.length + 1
      pickedLeader.leaderRound = leaderRound

      // Add to drafted leaders
      draftedLeaders.push(pickedLeader)

      // Update player
      await query(
        `UPDATE pod_players
         SET drafted_leaders = $1,
             leaders = $2,
             pick_status = 'picked',
             last_pick_at = NOW()
         WHERE id = $3`,
        [
          JSON.stringify(draftedLeaders),
          JSON.stringify(remainingLeaders),
          player.id
        ]
      )

      // Record in draft_picks for analytics
      try {
        await query(
          `INSERT INTO draft_picks (
            pod_id, user_id, card_id, card_name, set_code, rarity,
            card_type, variant_type, is_leader, pack_number, pick_in_pack,
            pick_number, leader_round
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 0, $9, $10, $11)`,
          [
            podId, session.id,
            pickedLeader.id, pickedLeader.name, pickedLeader.set, pickedLeader.rarity,
            pickedLeader.type, pickedLeader.variantType || 'Normal',
            leaderRound, pickedLeader.pickNumber, leaderRound
          ]
        )
      } catch (err) {
        console.error('[DRAFT_PICKS] Error recording leader pick:', err)
      }

      // Attribute this leader to the picker in card_generations so the
      // U6 "kept" scope (Your Stats) sees it. Fire-and-forget; failures
      // here don't block the pick. Picks have `card.id` not `instanceId`
      // as the card_generations key.
      attributePickedCard({
        podId,
        cardId: pickedLeader.id,
        userId: session.id,
      }).catch(() => {})

      // Check if all players have picked and advance
      await checkAndAdvanceLeaderDraft(podId, draftState, pod as never)

    } else if (draftState.phase === 'pack_draft') {
      // Find the card in current pack
      // Use instanceId if available (new drafts), fall back to id for backwards compatibility
      const cardIndex = (currentPack as PickCard[]).findIndex(c =>
        (c.instanceId && c.instanceId === cardId) || (!c.instanceId && c.id === cardId)
      )
      if (cardIndex === -1) {
        console.error('[PICK] Card not found. cardId:', cardId, 'available cards:', (currentPack as PickCard[]).map(c => ({ id: c.id, instanceId: c.instanceId, name: c.name })))
        return errorResponse('Card not available', 400)
      }

      // Pick the card
      const pickedCard = currentPack[cardIndex]
      const remainingPack = (currentPack as PickCard[]).filter((_, i) => i !== cardIndex)

      // Add pick metadata
      const packNumber = draftState.packNumber || 1
      const pickInPack = draftState.pickInPack || 1
      pickedCard.pickNumber = draftedCards.length + 1
      pickedCard.packNumber = packNumber
      pickedCard.pickInPack = pickInPack

      // Add to drafted cards
      draftedCards.push(pickedCard)

      // Update player
      await query(
        `UPDATE pod_players
         SET drafted_cards = $1,
             current_pack = $2,
             pick_status = 'picked',
             last_pick_at = NOW()
         WHERE id = $3`,
        [
          JSON.stringify(draftedCards),
          JSON.stringify(remainingPack),
          player.id
        ]
      )

      // Record in draft_picks for analytics
      try {
        await query(
          `INSERT INTO draft_picks (
            pod_id, user_id, card_id, card_name, set_code, rarity,
            card_type, variant_type, is_leader, pack_number, pick_in_pack,
            pick_number, leader_round
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, NULL)`,
          [
            podId, session.id,
            pickedCard.id, pickedCard.name, pickedCard.set, pickedCard.rarity,
            pickedCard.type, pickedCard.variantType || 'Normal',
            packNumber, pickInPack, pickedCard.pickNumber
          ]
        )
      } catch (err) {
        console.error('[DRAFT_PICKS] Error recording card pick:', err)
      }

      // Attribute this picked card to the picker in card_generations so
      // the U6 "kept" scope (Your Stats) sees it. Fire-and-forget; a
      // failure here costs one row of attribution, not the pick itself.
      attributePickedCard({
        podId,
        cardId: pickedCard.id,
        userId: session.id,
      }).catch(() => {})

      // Check if all players have picked and advance
      await checkAndAdvancePackDraft(podId, draftState, pod as never)
    }

    // Process bot turns (they will auto-pick until a human needs to act)
    // Run this in the background so it doesn't block the response
    processBotTurns(podId).catch(err => {
      console.error('Error processing bot turns:', err)
    })

    // Broadcast state update to SSE clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    return jsonResponse({ message: 'Pick successful' })
  } catch (error) {
    return handleApiError(error)
  }
}
