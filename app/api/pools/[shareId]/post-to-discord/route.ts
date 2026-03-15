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

    const deckSize = Object.values(positions).filter((p: any) => p.section === 'deck').length

    // Make pool public
    if (!pool.is_public) {
      await query('UPDATE card_pools SET is_public = true WHERE id = $1', [pool.id])
    }

    // Extract uploaded deck image if present
    let deckImageBuffer: Buffer | null = null
    try {
      const formData = await request.formData()
      const imageFile = formData.get('deckImage') as File | null
      if (imageFile) {
        const arrayBuf = await imageFile.arrayBuffer()
        deckImageBuffer = Buffer.from(arrayBuf)
      }
    } catch {
      // No form data — that's fine, post without image
    }

    // Post to Discord
    const result = await postDeckToDiscord({
      username: session.username || 'Unknown',
      poolShareId: shareId,
      leaderName: leader.name || 'Unknown Leader',
      leaderImageUrl: leader.imageUrl || '',
      baseName: base?.name || 'Unknown Base',
      deckSize,
      setCode: pool.set_code || 'Unknown',
      poolType: pool.pool_type || 'draft',
      deckImage: deckImageBuffer,
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
