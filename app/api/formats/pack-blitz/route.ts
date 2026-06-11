// @ts-nocheck
// POST /api/formats/pack-blitz - Generate a Pack Blitz pool (1 pack)
import { query } from '@/lib/db'
import { requireBetaAccess } from '@/lib/auth'
import { generateShareId } from '@/lib/utils'
import { jsonResponse, parseBody, validateRequired, handleApiError } from '@/lib/utils'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { generateBoosterPack } from '@/src/utils/boosterPack'
import { initializeCardCache } from '@/src/utils/cardCache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Require beta access for other formats
    const session = await requireBetaAccess(request)
    const userId = session.id

    const body = await parseBody(request)
    validateRequired(body, ['setCode'])

    const { setCode } = body

    // Validate set exists
    const setConfig = getSetConfig(setCode)
    if (!setConfig) {
      return jsonResponse({ error: 'Invalid set code' }, 400)
    }

    // Initialize card cache (needed for server-side pack generation)
    await initializeCardCache()

    // Generate 1 booster pack
    const pack = generateBoosterPack([], setCode)

    // Extract leaders and bases from pack (same format as pack wars)
    const leaders = pack.cards.filter(c => c.type === 'Leader')
    const bases = pack.cards.filter(c => c.type === 'Base')
    const deckCards = pack.cards.filter(c => c.type !== 'Leader' && c.type !== 'Base')

    // Generate unique share ID
    const shareId = generateShareId(8)

    // Generate default name with format: Pack Blitz (SET) MM/DD/YYYY
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const year = now.getFullYear()
    const defaultName = `Pack Blitz (${setCode}) ${month}/${day}/${year}`

    // Store pool metadata (same format as pack wars)
    const poolData = {
      setCode,
      setName: setConfig.setName,
      poolType: 'pack_blitz',
      leaders,
      bases,
      deckCards,
      packs: [pack.cards]
    }

    // Insert into card_pools table
    const result = await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, name, cards, packs, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, share_id, created_at`,
      [
        userId,
        shareId,
        setCode,
        setConfig.setName,
        'pack_blitz',
        defaultName,
        JSON.stringify(poolData),
        JSON.stringify([pack]),
        true
      ]
    )

    const pool = result.rows[0]
    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const shareUrl = `${APP_URL}/formats/pack-blitz/${shareId}`

    return jsonResponse({
      id: pool.id,
      shareId: pool.share_id,
      shareUrl,
      createdAt: pool.created_at,
      leaders,
      bases,
      deckCards
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
