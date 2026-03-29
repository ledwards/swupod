// @ts-nocheck
// GET /api/pools/:shareId - Get a card pool by share ID
// PUT /api/pools/:shareId - Update a card pool
// DELETE /api/pools/:shareId - Delete a card pool
import { queryRow, query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params

    // Try to get pool with new columns first, fallback to old schema if columns don't exist
    let pool
    try {
      pool = await queryRow(
        `SELECT
          cp.id,
          cp.user_id,
          cp.share_id,
          cp.set_code,
          cp.set_name,
          cp.pool_type,
          cp.name,
          cp.cards,
          cp.packs,
          cp.deck_builder_state,
          cp.is_public,
          cp.created_at,
          cp.updated_at,
          cp.pod_id,
          cp.box_packs,
          cp.pack_indices,
          cp.shuffled_packs,
          cp.wins,
          cp.losses,
          cp.draws,
          cp.wayfinder_match_ids,
          dp.share_id as draft_share_id,
          u.id as owner_id,
          u.username as owner_username
         FROM card_pools cp
         LEFT JOIN users u ON cp.user_id = u.id
         LEFT JOIN pods dp ON cp.pod_id = dp.id
         WHERE cp.share_id = $1`,
        [shareId]
      )
    } catch (error) {
      // If columns don't exist, use fallback query
      if (error.message.includes('name') || error.message.includes('set_name') || error.message.includes('pool_type')) {
        try {
          pool = await queryRow(
            `SELECT
              cp.id,
              cp.user_id,
              cp.share_id,
              cp.set_code,
              cp.set_name,
              cp.pool_type,
              cp.cards,
              cp.packs,
              cp.deck_builder_state,
              cp.is_public,
              cp.created_at,
              cp.updated_at,
              u.id as owner_id,
              u.username as owner_username
             FROM card_pools cp
             LEFT JOIN users u ON cp.user_id = u.id
             WHERE cp.share_id = $1`,
            [shareId]
          )
          // Add default values for missing columns
          if (pool) {
            pool.name = null
            pool.set_name = pool.set_name || null
            pool.pool_type = pool.pool_type || 'sealed'
          }
        } catch (innerError) {
          // If set_name or pool_type columns don't exist either
          if (innerError.message.includes('set_name') || innerError.message.includes('pool_type')) {
            pool = await queryRow(
              `SELECT
                cp.*,
                u.id as owner_id,
                u.username as owner_username
               FROM card_pools cp
               LEFT JOIN users u ON cp.user_id = u.id
               WHERE cp.share_id = $1`,
              [shareId]
            )
            // Add default values for missing columns
            if (pool) {
              pool.name = null
              pool.set_name = null
              pool.pool_type = 'sealed'
            }
          } else {
            throw innerError
          }
        }
      } else {
        throw error
      }
    }

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    // ShareId is the access mechanism - if you have the shareId, you can view it
    // Only check ownership for write operations (PUT/DELETE)
    // For GET, allow access to any pool by shareId

    // Parse JSON fields from database
    let cards = jsonParse(pool.cards)
    const packs = jsonParse(pool.packs)
    let deckBuilderState = jsonParse(pool.deck_builder_state)

    // Handle rotisserie pools - extract user's picked cards
    if (pool.pool_type === 'rotisserie' && cards && typeof cards === 'object' && cards.status) {
      const rotisserieData = cards
      const session = (() => {
        try {
          // Try to get user session for filtering their picks
          const { requireAuth } = require('@/lib/auth')
          return requireAuth(request)
        } catch {
          return null
        }
      })()

      // If user is authenticated, get their picks
      if (session?.id && rotisserieData.pickedCards && rotisserieData.players) {
        const pickedCardIds = new Set(
          rotisserieData.pickedCards
            .filter((p: { playerId: string }) => p.playerId === session.id)
            .map((p: { cardInstanceId: string }) => p.cardInstanceId)
        )

        // Combine all card pools and filter to user's picks
        const allCards = [
          ...(rotisserieData.cardPool || []),
          ...(rotisserieData.leaders || []),
          ...(rotisserieData.bases || [])
        ]

        cards = allCards.filter((c: { instanceId: string }) => pickedCardIds.has(c.instanceId))

        // Initialize deck builder state if not present
        if (!deckBuilderState) {
          deckBuilderState = { deck: [], pool: cards }
        }
      } else {
        // No session - return empty cards (need to be authenticated)
        cards = []
      }
    }

    // Generate name: prefer deckBuilderState.poolName, then pool.name column, then generate default
    let name = deckBuilderState?.poolName || pool.name
    if (!name) {
      const poolType = pool.pool_type || 'sealed'
      const formatType = poolType === 'draft' ? 'Draft' :
        poolType === 'rotisserie' ? 'Rotisserie Draft' : 'Sealed'
      const setCode = pool.set_code || ''
      const setCodes = setCode.includes(',') ? setCode.split(',').map((s: string) => s.trim()) : [setCode]
      const setCodeDisplay = formatSetCodeRange(setCodes)
      name = `${setCodeDisplay} ${formatType}`
    }

    return jsonResponse({
      id: pool.id,
      shareId: pool.share_id,
      setCode: pool.set_code,
      setName: pool.set_name || null, // Handle case where column doesn't exist
      poolType: pool.pool_type || 'sealed',
      name: name,
      cards,
      packs,
      deckBuilderState,
      isPublic: pool.is_public,
      createdAt: pool.created_at,
      updatedAt: pool.updated_at,
      draftShareId: pool.draft_share_id || null,
      hasBox: Boolean(pool.box_packs), // Whether randomization is available
      shuffledPacks: pool.shuffled_packs || false,
      wins: pool.wins ?? 0,
      losses: pool.losses ?? 0,
      draws: pool.draws ?? 0,
      wayfinderMatchIds: pool.wayfinder_match_ids ?? [],
      owner: pool.owner_id
        ? {
            id: pool.owner_id,
            username: pool.owner_username,
          }
        : null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const body = await parseBody(request)

    // Check ownership - only select needed columns (avoid loading large JSONB)
    const pool = await queryRow(
      'SELECT id, user_id, deck_builder_state FROM card_pools WHERE share_id = $1',
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    // Authorization logic:
    // - Anonymous pools (user_id is null) can be edited by anyone
    // - Owned pools require the owner to be authenticated
    if (pool.user_id !== null) {
      const session = requireAuth(request)
      if (pool.user_id !== session.id) {
        return errorResponse('Unauthorized', 403)
      }
    }

    // Update pool
    const updates = []
    const values = []
    let paramIndex = 1

    if (body.cards !== undefined) {
      updates.push(`cards = $${paramIndex++}`)
      values.push(JSON.stringify(body.cards))
    }
    if (body.packs !== undefined) {
      updates.push(`packs = $${paramIndex++}`)
      values.push(body.packs ? JSON.stringify(body.packs) : null)
    }

    // Handle deckBuilderState - if poolName is provided separately, merge it in
    let deckBuilderStateToSave = body.deckBuilderState
    if (body.poolName !== undefined) {
      // Merge poolName into existing or provided deckBuilderState
      const existingState = jsonParse(pool.deck_builder_state, {})
      const newState = deckBuilderStateToSave || existingState
      deckBuilderStateToSave = { ...newState, poolName: body.poolName }
    }

    if (deckBuilderStateToSave !== undefined) {
      updates.push(`deck_builder_state = $${paramIndex++}`)
      values.push(deckBuilderStateToSave ? JSON.stringify(deckBuilderStateToSave) : null)
    }

    if (body.isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex++}`)
      values.push(body.isPublic)
    }
    if (body.setCode !== undefined) {
      updates.push(`set_code = $${paramIndex++}`)
      values.push(body.setCode)
    }
    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(body.name)
    }
    if (typeof body.hidden === 'boolean') {
      updates.push(`hidden = $${paramIndex++}`)
      values.push(body.hidden)
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400)
    }

    values.push(shareId)
    const result = await query(
      `UPDATE card_pools
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE share_id = $${paramIndex}
       RETURNING *`,
      values
    )

    return jsonResponse({
      id: result.rows[0].id,
      shareId: result.rows[0].share_id,
      updatedAt: result.rows[0].updated_at,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Check ownership - only select needed columns (avoid loading large JSONB)
    const pool = await queryRow(
      'SELECT id, user_id FROM card_pools WHERE share_id = $1',
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    if (pool.user_id !== session.id) {
      return errorResponse('Unauthorized', 403)
    }

    // Delete pool
    await query('DELETE FROM card_pools WHERE share_id = $1', [shareId])

    return jsonResponse({ message: 'Pool deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
