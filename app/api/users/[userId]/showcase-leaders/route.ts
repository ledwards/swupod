// @ts-nocheck
// GET /api/users/:userId/showcase-leaders - Get all showcase leaders pulled by a user
import { queryRows } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { userId } = await params

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const setCode = searchParams.get('set') // Optional: filter by set
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Build query with optional set filter
    let whereClause = 'WHERE user_id = $1 AND treatment = $2 AND card_type = $3'
    const queryParams: (string | number)[] = [userId, 'showcase', 'Leader']

    if (setCode) {
      whereClause += ' AND set_code = $4'
      queryParams.push(setCode)
    }

    // Get showcase leaders for this user
    const leaders = await queryRows(
      `SELECT
        id,
        card_id,
        set_code,
        card_name,
        card_subtitle,
        variant_type,
        source_type,
        source_share_id,
        generated_at
       FROM card_generations
       ${whereClause}
       ORDER BY generated_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, limit, offset]
    )

    // Get total count
    const countResult = await queryRows(
      `SELECT COUNT(*) as total FROM card_generations ${whereClause}`,
      queryParams
    )
    const total = parseInt(countResult[0]?.total || 0, 10)

    // Get unique leaders count (by card_id)
    const uniqueResult = await queryRows(
      `SELECT COUNT(DISTINCT card_id) as unique_count FROM card_generations ${whereClause}`,
      queryParams
    )
    const uniqueCount = parseInt(uniqueResult[0]?.unique_count || 0, 10)

    return jsonResponse({
      showcaseLeaders: leaders.map(leader => ({
        id: leader.id,
        cardId: leader.card_id,
        setCode: leader.set_code,
        cardName: leader.card_name,
        cardSubtitle: leader.card_subtitle,
        variantType: leader.variant_type,
        sourceType: leader.source_type,
        sourceShareId: leader.source_share_id,
        generatedAt: leader.generated_at
      })),
      total,
      uniqueCount,
      limit,
      offset
    })
  } catch (error) {
    return handleApiError(error)
  }
}
