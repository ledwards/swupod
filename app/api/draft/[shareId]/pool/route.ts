// @ts-nocheck
// GET/POST /api/draft/:shareId/pool - Get or create a pool from drafted cards
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'
import { promoTierForCode, grantableEventPackCodes } from '@/src/services/chaosSealedSelection'
import { getCampaign, drawEventPack } from '@/src/services/promoPacks'
import { initializeCardCache } from '@/src/utils/cardCache'
import { getAllCards } from '@/src/utils/cardData'
import { nanoid } from 'nanoid'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get the draft pod
    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Check if user is a player in this draft
    const player = await queryRow(
      'SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2',
      [pod.id, session.id]
    )

    if (!player) {
      return errorResponse('You are not a player in this draft', 403)
    }

    // Check if a pool already exists for this user and draft
    const existingPool = await queryRow(
      'SELECT * FROM card_pools WHERE pod_id = $1 AND user_id = $2',
      [pod.id, session.id]
    )

    if (existingPool) {
      return jsonResponse({
        poolShareId: existingPool.share_id,
        created: false,
      })
    }

    // Draft must be complete to create a pool
    if (pod.status !== 'complete') {
      return errorResponse('Draft is not complete yet', 400)
    }

    // Combine leaders and cards
    const draftedLeaders = typeof player.drafted_leaders === 'string'
      ? JSON.parse(player.drafted_leaders)
      : player.drafted_leaders || []

    const draftedCards = typeof player.drafted_cards === 'string'
      ? JSON.parse(player.drafted_cards)
      : player.drafted_cards || []

    const allCards = [...draftedLeaders, ...draftedCards]

    // Group drafted cards by pack number (the round they were picked in)
    const packsByRound = {}
    for (const card of draftedCards) {
      const packNum = card.packNumber || 1
      if (!packsByRound[packNum]) {
        packsByRound[packNum] = []
      }
      packsByRound[packNum].push(card)
    }

    // Sort cards within each pack by pick number
    for (const packNum of Object.keys(packsByRound)) {
      packsByRound[packNum].sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0))
    }

    // Format packs to match sealed pools format (sorted by pack number)
    const formattedPacks = Object.keys(packsByRound)
      .sort((a, b) => Number(a) - Number(b))
      .map(packNum => ({
        cards: packsByRound[packNum]
      }))

    // Create a new pool
    const poolShareId = nanoid(8)
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const year = String(now.getFullYear()).slice(-2)

    // For chaos drafts, store all sets as comma-separated set_code
    const settings = typeof pod.settings === 'string' ? JSON.parse(pod.settings) : pod.settings || {}
    const chaosSets = settings.draftMode === 'chaos' && settings.chaosSets
    const uniqueChaosSets = chaosSets ? [...new Set(chaosSets as string[])] : null
    const poolSetCode = chaosSets ? chaosSets.join(',') : pod.set_code
    const setName = uniqueChaosSets ? formatSetCodeRange(uniqueChaosSets) : (pod.set_name || pod.set_code)
    const defaultName = uniqueChaosSets
      ? `${formatSetCodeRange(uniqueChaosSets)} Chaos Draft ${month}/${day}/${year}`
      : `${pod.set_code} Draft ${month}/${day}/${year}`

    // GC Event Packs (opt-in) augment this player's pool the same way they augment a sealed
    // pool: opened as a keepsake bonus, never drafted. Only tiers THIS player actually owns are
    // added — re-validated from promo_entitlements, so a bot or non-owner gets nothing even if
    // the draft carried event packs.
    const eventPackCodes: string[] = Array.isArray(settings.eventPacks) ? settings.eventPacks : []
    if (eventPackCodes.length > 0) {
      const requestedTiers = new Set(eventPackCodes.map(promoTierForCode).filter(Boolean))
      const campaign = getCampaign('gc2026')
      if (requestedTiers.size > 0 && campaign) {
        const ownedRows = await queryRows(
          'SELECT promo_tier FROM promo_entitlements WHERE user_id = $1 AND campaign = $2',
          [session.id, 'gc2026']
        )
        const owned = new Set(ownedRows.map(r => r.promo_tier))
        const grantable = grantableEventPackCodes(eventPackCodes, owned)
        if (grantable.length > 0) {
          await initializeCardCache()
          const cardsById = new Map(getAllCards().map(c => [c.id, c]))
          for (const code of grantable) {
            const tier = promoTierForCode(code)
            const pack = drawEventPack(campaign, tier, id => cardsById.get(id) ?? null)
            allCards.push(...pack.cards)
            formattedPacks.push({
              cards: pack.cards,
              setCode: code,
              setName: `2026 GC ${tier === 'silver' ? 'Silver' : 'Black'} Pack`,
              isEventPack: true,
            })
          }
        }
      }
    }

    await query(
      `INSERT INTO card_pools (
        user_id,
        share_id,
        set_code,
        set_name,
        pool_type,
        name,
        cards,
        packs,
        pod_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        session.id,
        poolShareId,
        poolSetCode,
        setName,
        'draft',
        defaultName,
        JSON.stringify(allCards),
        JSON.stringify(formattedPacks),
        pod.id
      ]
    )

    captureLimitedServerEvent(
      LimitedAnalyticsEvents.LIMITED_POOL_CREATED,
      session.id,
      {
        format: 'draft',
        mode: settings.isSolo === true ? 'solo' : 'group',
        setCode: poolSetCode,
        pack_count: formattedPacks.length,
        poolShareId,
        podShareId: shareId,
      }
    )

    return jsonResponse({
      poolShareId,
      created: true,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
