// @ts-nocheck
// POST /api/formats/chaos-sealed - Generate a Chaos Sealed pool (6 packs from 6 different sets)
import { query, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { generateShareId, formatSetCodeRange } from '@/lib/utils'
import { jsonResponse, errorResponse, parseBody, validateRequired, handleApiError } from '@/lib/utils'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { generateBoosterPack } from '@/src/utils/boosterPack'
import { isCarboniteCode, getBaseSetCode, isCarboniteSupported } from '@/src/utils/carboniteConstants'
import { initializeCardCache } from '@/src/utils/cardCache'
import { getAllCards } from '@/src/utils/cardData'
import { getCampaign, drawEventPack } from '@/src/services/promoPacks'
import { NextRequest, NextResponse } from 'next/server'

const PROMO_CAMPAIGN = 'gc2026'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth is optional - allow anonymous users to create chaos sealed pools
    const session = getSession(request)
    const userId = session?.id || null

    const body = await parseBody(request)
    validateRequired(body, ['setCodes'])

    const { setCodes } = body

    // Validate pack count (1-12)
    if (!Array.isArray(setCodes) || setCodes.length < 1 || setCodes.length > 12) {
      return errorResponse('Must select between 1 and 12 packs', 400)
    }

    // Validate all sets exist
    const setConfigs = []
    for (const setCode of setCodes) {
      const baseCode = isCarboniteCode(setCode) ? getBaseSetCode(setCode) : setCode
      const setConfig = getSetConfig(baseCode)
      if (!setConfig) {
        return errorResponse(`Invalid set code: ${setCode}`, 400)
      }
      // Validate Carbonite is only for supported sets
      if (isCarboniteCode(setCode) && !isCarboniteSupported(baseCode)) {
        return errorResponse(`Carbonite not available for ${baseCode}`, 400)
      }
      setConfigs.push(setConfig)
    }

    // Initialize card cache (needed for server-side pack generation)
    await initializeCardCache()

    // Generate packs (1 from each selected set)
    const packs = []
    const allCards = []

    for (let i = 0; i < setCodes.length; i++) {
      const setCode = setCodes[i]
      const pack = generateBoosterPack([], setCode)
      packs.push({
        ...pack,
        setCode,
        setName: setConfigs[i].setName
      })
      allCards.push(...pack.cards)
    }

    // Optionally add the user's unlocked GC Event Packs as extra packs. Ownership is
    // validated server-side against promo_entitlements — a client can't spoof a tier it
    // hasn't claimed. Each Event Pack contributes its drawn cards to the pool.
    const requestedTiers = Array.isArray(body.promoTiers)
      ? body.promoTiers.filter((t: unknown): t is string => t === 'silver' || t === 'black')
      : []
    if (userId && requestedTiers.length > 0) {
      const campaign = getCampaign(PROMO_CAMPAIGN)
      if (campaign) {
        const ownedRows = await queryRows(
          'SELECT promo_tier FROM promo_entitlements WHERE user_id = $1 AND campaign = $2',
          [userId, PROMO_CAMPAIGN]
        )
        const owned = new Set(ownedRows.map(r => r.promo_tier))
        const cardsById = new Map(getAllCards().map(c => [c.id, c]))
        for (const tier of [...new Set(requestedTiers)]) {
          if (!owned.has(tier)) continue // silently skip tiers the user doesn't own
          const eventPack = drawEventPack(campaign, tier as 'silver' | 'black', id => cardsById.get(id) ?? null)
          packs.push({
            ...eventPack,
            setCode: `GC2026_${tier.toUpperCase()}`,
            setName: `2026 GC ${tier === 'silver' ? 'Silver' : 'Black'} Pack`,
          })
          allCards.push(...eventPack.cards)
        }
      }
    }

    // Generate unique share ID
    const shareId = generateShareId(8)

    // Generate default name with format: Chaos Sealed (SETS) MM/DD/YYYY
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const year = now.getFullYear()
    const uniqueSets = [...new Set(setCodes)]
    const setLabel = uniqueSets.length <= 3
      ? formatSetCodeRange(uniqueSets)
      : `${setCodes.length} packs / ${uniqueSets.length} sets`
    const defaultName = `Chaos Sealed (${setLabel}) ${month}/${day}/${year}`

    // Insert into card_pools table
    // cards column = flat array of all cards
    // packs column = array of pack objects with setCode/setName metadata
    const result = await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, name, cards, packs, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, share_id, created_at`,
      [
        userId,
        shareId,
        setCodes.join(','),
        `Chaos Sealed (${setLabel})`,
        'chaos_sealed',
        defaultName,
        JSON.stringify(allCards),
        JSON.stringify(packs),
        true
      ]
    )

    const pool = result.rows[0]
    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const shareUrl = `${APP_URL}/formats/chaos-sealed/${shareId}`

    return jsonResponse({
      id: pool.id,
      shareId: pool.share_id,
      shareUrl,
      createdAt: pool.created_at,
      setCodes,
      setNames: setConfigs.map(c => c.setName),
      cardCount: allCards.length,
      packCount: packs.length
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
