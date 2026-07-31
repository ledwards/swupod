// @ts-nocheck
// POST /api/pools - Create a new card pool
import { query } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { generateShareId, formatSetCodeRange } from '@/lib/utils'
import { jsonResponse, parseBody, validateRequired, handleApiError } from '@/lib/utils'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { getUnavailableSetReason } from '@/src/utils/setAvailability'
import { sealedPackBucket, packCountNameSuffix } from '@/src/utils/sealedFormat'
import { trackBulkGenerations, PACK_SLOT_TYPES } from '@/src/utils/trackGeneration'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { hashAnalyticsId, LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await parseBody(request)
    validateRequired(body, ['setCode', 'cards'])

    const {
      setCode,
      cards,
      packs,
      deckBuilderState,
      isPublic: requestedIsPublic = true,
      shareId: clientShareId,
      poolType = 'sealed',
      boxPacks,
      packIndices,
      hidden = false,
      name: requestedName,
      parentPoolId: parentShareId,
    } = body

    const session = getSession(request)
    const unavailableReason = getUnavailableSetReason(setCode, session)
    if (unavailableReason) {
      return jsonResponse({ error: unavailableReason }, 403)
    }

    // Get set name from config
    const setConfig = getSetConfig(setCode)
    const setName = setConfig?.setName || setCode

    // Get user session (optional - allow anonymous pools)
    const userId = session?.id || null

    // Handle parent pool (build creation)
    let parentPoolDbId = null
    let isPublic = requestedIsPublic
    if (parentShareId) {
      const parent = await query(
        'SELECT id, parent_pool_id, is_public FROM card_pools WHERE share_id = $1',
        [parentShareId]
      )
      if (!parent.rows.length) {
        return jsonResponse({ error: 'Parent pool not found' }, 404)
      }
      if (parent.rows[0].parent_pool_id !== null) {
        return jsonResponse({ error: 'Cannot create a build from another build' }, 400)
      }
      parentPoolDbId = parent.rows[0].id
      isPublic = parent.rows[0].is_public
      // Note: no dedup. Multiple builds per (user, parent pool) is by design.
    }

    // Use client-provided shareId if available, otherwise generate one
    let shareId = clientShareId
    let attempts = 0
    const maxAttempts = 10

    // If client provided shareId, use it. Otherwise generate one.
    if (!shareId) {
      shareId = generateShareId(8)
    }

    // Sealed pack count is a FORMAT distinction (6-pack vs 8-pack sealed are
    // different formats for lobby matchmaking), so it goes in the pool's name.
    // Derived from the packs array — never stored twice. Builds arrive with
    // packs: null and inherit the parent's count; unknown means no suffix.
    const packCount = sealedPackBucket({
      poolType,
      packCount: Array.isArray(packs) ? packs.length : null,
    })

    // Helper function to generate default pool name.
    // Format: "{setCodeDisplay} {Sealed|Draft|...} Pool {(N-pack)} {MM.DD.YY}"
    // Matches getDefaultBuildName() format once a leader is picked, so the
    // date stays consistent across the auto-rename → user-edit lifecycle.
    const generatePoolName = (poolType: string, setCode: string) => {
      const formatType = poolType === 'draft' ? 'Draft' :
        poolType === 'rotisserie' ? 'Rotisserie Draft' : 'Sealed'
      const setCodes = setCode.includes(',') ? setCode.split(',').map(s => s.trim()) : [setCode]
      const setCodeDisplay = formatSetCodeRange(setCodes)
      const now = new Date()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const yy = String(now.getFullYear()).slice(-2)
      return `${setCodeDisplay} ${formatType} Pool${packCountNameSuffix(packCount)} ${mm}.${dd}.${yy}`
    }

    // Insert pool with retry logic to handle unique constraint violations
    // This is more robust than checking first because it handles race conditions
    let result
    while (attempts < maxAttempts) {
      try {
        // Calculate default name
        const defaultName = requestedName || generatePoolName(poolType, setCode)

        // Try to insert with current shareId
        try {
          result = await query(
            `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, name, cards, packs, deck_builder_state, is_public, hidden, box_packs, pack_indices, shuffled_packs, parent_pool_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id, share_id, created_at`,
            [
              userId,
              shareId,
              setCode,
              setName,
              poolType,
              defaultName,
              JSON.stringify(cards),
              packs ? JSON.stringify(packs) : null,
              deckBuilderState ? JSON.stringify(deckBuilderState) : null,
              isPublic,
              hidden,
              boxPacks ? JSON.stringify(boxPacks) : null,
              packIndices || null,
              false, // shuffled_packs starts as false
              parentPoolDbId,
            ]
          )
          // Success - break out of retry loop
          break
        } catch (error) {
          // If name column doesn't exist, try without it
          if (error.message.includes('name')) {
            try {
              result = await query(
                `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, cards, packs, deck_builder_state, is_public, hidden)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING id, share_id, created_at`,
                [
                  userId,
                  shareId,
                  setCode,
                  setName,
                  poolType,
                  JSON.stringify(cards),
                  packs ? JSON.stringify(packs) : null,
                  deckBuilderState ? JSON.stringify(deckBuilderState) : null,
                  isPublic,
                  hidden,
                ]
              )
              // Success - break out of retry loop
              break
            } catch (innerError) {
              // If set_name or pool_type columns don't exist, use fallback query
              if (innerError.message.includes('set_name') || innerError.message.includes('pool_type')) {
                result = await query(
                  `INSERT INTO card_pools (user_id, share_id, set_code, cards, packs, deck_builder_state, is_public, hidden)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   RETURNING id, share_id, created_at`,
                  [
                    userId,
                    shareId,
                    setCode,
                    JSON.stringify(cards),
                    packs ? JSON.stringify(packs) : null,
                    deckBuilderState ? JSON.stringify(deckBuilderState) : null,
                    isPublic,
                    hidden,
                  ]
                )
                // Success - break out of retry loop
                break
              }
              throw innerError
            }
          }
          // If set_name or pool_type columns don't exist, use fallback query
          else if (error.message.includes('set_name') || error.message.includes('pool_type')) {
            result = await query(
              `INSERT INTO card_pools (user_id, share_id, set_code, cards, packs, deck_builder_state, is_public, hidden)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id, share_id, created_at`,
              [
                userId,
                shareId,
                setCode,
                JSON.stringify(cards),
                packs ? JSON.stringify(packs) : null,
                deckBuilderState ? JSON.stringify(deckBuilderState) : null,
                isPublic,
                hidden,
              ]
            )
            // Success - break out of retry loop
            break
          }
          // If it's a unique constraint violation, generate a new ID and retry
          if (error.message.includes('duplicate key') || error.message.includes('UNIQUE constraint') || error.code === '23505') {
            shareId = generateShareId(8)
            attempts++
            continue
          }
          // For other errors, rethrow
          throw error
        }
      } catch (error) {
        // If it's a unique constraint violation, generate a new ID and retry
        if (error.message.includes('duplicate key') || error.message.includes('UNIQUE constraint') || error.code === '23505') {
          shareId = generateShareId(8)
          attempts++
          continue
        }
        // For other errors, rethrow
        throw error
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique share ID after multiple attempts')
    }

    const pool = result.rows[0]
    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const shareUrl = `${APP_URL}/pool/${shareId}`

    // Track all generated cards for statistics (async, non-blocking)
    // Use packs array if available to get pack_index, otherwise fall back to flat cards array
    if (packs && Array.isArray(packs)) {
      const trackingRecords = []
      packs.forEach((pack, packIndex) => {
        // Support both formats: pack as array or pack as {cards: [...]} object
        const packCards = Array.isArray(pack) ? pack : pack.cards
        if (Array.isArray(packCards)) {
          packCards.forEach((card, cardIndex) => {
            trackingRecords.push({
              card,
              options: {
                packType: 'booster',
                sourceType: 'sealed',
                sourceId: pool.id,
                sourceShareId: shareId,
                packIndex,
                slotType: PACK_SLOT_TYPES[cardIndex] || null,
                userId
              }
            })
          })
        }
      })
      trackBulkGenerations(trackingRecords).catch(err => {
        console.error('Failed to track sealed pool generations:', err)
      })
    } else if (cards && Array.isArray(cards)) {
      // Fallback for older clients that don't send packs array
      const trackingRecords = cards.map(card => ({
        card,
        options: {
          packType: 'booster',
          sourceType: 'sealed',
          sourceId: pool.id,
          sourceShareId: shareId,
          packIndex: null,
          userId
        }
      }))
      trackBulkGenerations(trackingRecords).catch(err => {
        console.error('Failed to track sealed pool generations:', err)
      })
    }

    const isCoreLimitedPool = (poolType === 'sealed' || poolType === 'draft')
      && !parentPoolDbId
      && deckBuilderState?.isInfinitePool !== true
    if (isCoreLimitedPool) {
      captureLimitedServerEvent(
        LimitedAnalyticsEvents.LIMITED_POOL_CREATED,
        userId || hashAnalyticsId(shareId),
        {
          format: poolType === 'draft' ? 'draft' : 'sealed',
          mode: 'solo',
          setCode,
          pack_count: Array.isArray(packs) ? packs.length : null,
          poolShareId: shareId,
          flowId: body.flowId || body.flow_id || null,
        }
      )
    }

    return jsonResponse({
      id: pool.id,
      shareId: pool.share_id,
      shareUrl,
      createdAt: pool.created_at,
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
