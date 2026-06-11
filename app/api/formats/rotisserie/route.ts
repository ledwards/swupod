// @ts-nocheck
// POST /api/formats/rotisserie - Create a Rotisserie Draft
import { query } from '@/lib/db'
import { requireBetaAccess } from '@/lib/auth'
import { generateShareId } from '@/lib/utils'
import { jsonResponse, parseBody, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireBetaAccess(request)
    const userId = session.id

    const body = await parseBody(request)

    const {
      setCodes = [],
      maxPlayers = 8,
      pickTimerSeconds = 120,
      timerEnabled = false,
      picksPerPlayer = 42,
      draftMode = 'fixed'
    } = body

    const shareId = generateShareId(8)

    // Store draft setup data - card pool is generated when draft starts
    const draftData = {
      setCodes,
      maxPlayers,
      pickTimerSeconds,
      timerEnabled,
      picksPerPlayer,
      draftMode,
      status: 'waiting',
      players: [{
        id: userId,
        name: session.username || 'Host',
        seat: 1,
        avatarUrl: session.avatar_url || null
      }]
    }

    await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, name, cards, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, share_id, created_at`,
      [
        userId,
        shareId,
        '',
        'Rotisserie Draft',
        'rotisserie',
        'Rotisserie Draft',
        JSON.stringify(draftData),
        true
      ]
    )

    return jsonResponse({ shareId }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
