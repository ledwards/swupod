// @ts-nocheck
// GET /api/pools/:shareId/builds - List all builds for a root pool
import { queryRow, query } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

function extractBuildInfo(deckBuilderState: unknown) {
  const state = jsonParse(deckBuilderState) || {}
  const positions = state.cardPositions || {}
  const leaderKey = state.activeLeader || null
  const baseKey = state.activeBase || null
  const leaderName = leaderKey ? (positions[leaderKey]?.card?.name || null) : null
  const baseName = baseKey ? (positions[baseKey]?.card?.name || null) : null
  const deckCardCount = Object.values(positions).filter(
    (pos: any) => pos.section === 'deck' && pos.visible !== false && !pos.card?.isBase && !pos.card?.isLeader
  ).length
  return { leaderName, baseName, deckCardCount }
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params

    const root = await queryRow(
      `SELECT id, share_id, user_id, name, deck_builder_state, is_public
       FROM card_pools WHERE share_id = $1`,
      [shareId]
    )

    if (!root) {
      return errorResponse('Pool not found', 404)
    }

    const children = await query(
      `SELECT cp.share_id, cp.deck_builder_state, cp.created_at, cp.user_id,
              u.username as builder_name
       FROM card_pools cp
       LEFT JOIN users u ON cp.user_id = u.id
       WHERE cp.parent_pool_id = $1
       ORDER BY cp.created_at ASC`,
      [root.id]
    )

    const rootEntry = {
      shareId: root.share_id,
      builderName: null,
      isOriginal: true,
      ...extractBuildInfo(root.deck_builder_state),
    }

    const buildEntries = children.rows.map(b => ({
      shareId: b.share_id,
      builderName: b.builder_name || null,
      isOriginal: false,
      ...extractBuildInfo(b.deck_builder_state),
    }))

    return jsonResponse({ builds: [rootEntry, ...buildEntries] })
  } catch (error) {
    return handleApiError(error)
  }
}
