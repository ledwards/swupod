// @ts-nocheck
// POST /api/pools/:shareId/post-to-discord - Post deck to Discord pool discussion channel
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { postDeckToDiscord } from '@/lib/discordLfg'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get pool with deck builder state
    const pool = await queryRow(
      'SELECT * FROM card_pools WHERE share_id = $1',
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    if (pool.user_id && pool.user_id !== session.id) {
      return errorResponse('Not your pool', 403)
    }

    // Parse deck builder state to get leader/base info
    const state = typeof pool.deck_builder_state === 'string'
      ? JSON.parse(pool.deck_builder_state)
      : pool.deck_builder_state

    if (!state?.cardPositions || !state?.activeLeader) {
      return errorResponse('No deck built yet', 400)
    }

    const positions = state.cardPositions
    const leaderPos = positions[state.activeLeader]
    const basePos = state.activeBase ? positions[state.activeBase] : null
    const leader = leaderPos?.card
    const base = basePos?.card

    if (!leader) {
      return errorResponse('No leader selected', 400)
    }

    // Extract deck and sideboard cards from positions
    const deckCards: Array<{ name: string; variantType?: string }> = []
    const sideboardCards: Array<{ name: string; variantType?: string }> = []
    for (const pos of Object.values(positions) as any[]) {
      if (!pos.card || pos.card.isLeader || pos.card.isBase) continue
      if (pos.enabled === false) continue
      const cardInfo = { name: pos.card.name, variantType: pos.card.variantType }
      if (pos.section === 'deck') {
        deckCards.push(cardInfo)
      } else if (pos.section === 'sideboard') {
        sideboardCards.push(cardInfo)
      }
    }

    const deckSize = deckCards.length

    // Make pool public
    if (!pool.is_public) {
      await query('UPDATE card_pools SET is_public = true WHERE id = $1', [pool.id])
    }

    // If this pool came from a draft, get the draft share ID and make the log public
    let draftShareId: string | null = null
    if (pool.pod_id) {
      const pod = await queryRow('SELECT share_id FROM pods WHERE id = $1', [pool.pod_id])
      if (pod) {
        draftShareId = pod.share_id
        // Make the player's draft log public
        await query(
          'UPDATE pod_players SET is_log_public = true WHERE pod_id = $1 AND user_id = $2',
          [pool.pod_id, session.id]
        )
      }
    }

    // Post to Discord (image generated server-side via swuapi)
    const result = await postDeckToDiscord({
      username: session.username || 'Unknown',
      poolShareId: shareId,
      leaderName: leader.name || 'Unknown Leader',
      leaderImageUrl: leader.imageUrl || '',
      leaderVariantType: leader.variantType,
      baseName: base?.name || 'Unknown Base',
      baseVariantType: base?.variantType,
      deckSize,
      setCode: pool.set_code || 'Unknown',
      poolType: pool.pool_type || 'draft',
      deckCards,
      sideboardCards,
      draftShareId,
    })

    if (!result) {
      return errorResponse('Failed to post to Discord', 500)
    }

    return jsonResponse({
      success: true,
      threadId: result.threadId,
      messageId: result.messageId,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
