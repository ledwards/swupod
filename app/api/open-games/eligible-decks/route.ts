/**
 * GET /api/open-games/eligible-decks?setCode=SEC&format=draft
 * The caller's decks eligible for posting/joining (R23/R31): pools with a
 * built deck (leader+base recorded via built_decks). Unfiltered, it powers
 * the New Game picker; filtered, the Join picker ("2 of 7 eligible").
 */
import { requireAuth } from '@/lib/auth'
import { jsonResponse } from '@/lib/utils'
import { queryRows } from '@/lib/db'
import { openGameErrorResponse } from '../helpers'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)
    const setCode = searchParams.get('setCode')
    const format = searchParams.get('format')

    const rows = await queryRows(
      `SELECT cp.share_id, cp.set_code, cp.set_name, cp.pool_type, cp.name,
              bd.built_at
       FROM card_pools cp
       JOIN built_decks bd ON bd.card_pool_id = cp.id
       WHERE cp.user_id = $1 AND cp.hidden IS NOT TRUE
       ORDER BY bd.built_at DESC NULLS LAST
       LIMIT 100`,
      [session.id]
    )

    const decks = rows.map(r => ({
      poolShareId: String(r.share_id),
      setCode: String(r.set_code),
      setName: r.set_name ? String(r.set_name) : null,
      format: r.pool_type ? String(r.pool_type) : 'sealed',
      name: r.name ? String(r.name) : null,
      builtAt: r.built_at ? String(r.built_at) : null,
      eligible:
        (!setCode || String(r.set_code) === setCode) &&
        (!format || String(r.pool_type || 'sealed') === format),
    }))

    return jsonResponse({
      decks,
      eligibleCount: decks.filter(d => d.eligible).length,
      totalCount: decks.length,
    })
  } catch (error) {
    return openGameErrorResponse(error)
  }
}
