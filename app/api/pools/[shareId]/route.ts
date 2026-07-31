// @ts-nocheck
// GET /api/pools/:shareId - Get a card pool by share ID
// PUT /api/pools/:shareId - Update a card pool
// DELETE /api/pools/:shareId - Delete a card pool
import { queryRow, query } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { resolveCatalogCards } from '@/src/services/cards/cardCatalogResolver'
import { sealedPackBucket } from '@/src/utils/sealedFormat'
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
          cp.parent_pool_id,
          dp.share_id as draft_share_id,
          u.id as owner_id,
          u.username as owner_username,
          pp.share_id as parent_share_id,
          pp.packs as parent_packs,
          CASE
            WHEN cp.parent_pool_id IS NULL THEN
              (SELECT COUNT(*) FROM card_pools WHERE parent_pool_id = cp.id)
            ELSE
              (SELECT COUNT(*) + 1 FROM card_pools WHERE parent_pool_id = cp.parent_pool_id)
          END as build_count
         FROM card_pools cp
         LEFT JOIN users u ON cp.user_id = u.id
         LEFT JOIN pods dp ON cp.pod_id = dp.id
         LEFT JOIN card_pools pp ON cp.parent_pool_id = pp.id
         WHERE cp.share_id = $1`,
        [shareId]
      )
    } catch (error) {
      // If columns don't exist, use fallback query
      if (error.message.includes('name') || error.message.includes('set_name') || error.message.includes('pool_type') ||
          error.message.includes('wins') || error.message.includes('losses') || error.message.includes('draws') || error.message.includes('wayfinder') ||
          error.message.includes('parent_pool_id')) {
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
            pool.wins = pool.wins ?? 0
            pool.losses = pool.losses ?? 0
            pool.draws = pool.draws ?? 0
            pool.wayfinder_match_ids = pool.wayfinder_match_ids ?? []
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
    let packs = jsonParse(pool.packs)
    // Capture the raw pack count BEFORE any per-format reshaping below —
    // it is the pool's sealed FORMAT bucket (6-pack vs 8-pack never pair).
    const rawParentPacks = jsonParse(pool.parent_packs)
    const packsPerPlayer = sealedPackBucket({
      poolType: pool.pool_type || 'sealed',
      packCount: Array.isArray(packs) ? packs.length : null,
      parentPackCount: Array.isArray(rawParentPacks) ? rawParentPacks.length : null,
    })
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

    cards = resolveCatalogCards(cards)
    packs = resolveCatalogCards(packs)
    deckBuilderState = resolveCatalogCards(deckBuilderState)

    // Generate name: prefer deckBuilderState.poolName, then pool.name column, then generate default
    let name = deckBuilderState?.poolName || pool.name
    if (!name) {
      const poolType = pool.pool_type || 'sealed'
      const formatType = deckBuilderState?.isInfinitePool ? 'Limited' : poolType === 'draft' ? 'Draft' :
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
      parentShareId: pool.parent_share_id || null,
      // Sealed pack count is a FORMAT distinction (6-pack sealed never pairs
      // with 8-pack). Derived, never stored twice; a build inherits its
      // parent's packs. Null for draft and every other format.
      packsPerPlayer,
      buildCount: parseInt(pool.build_count || '0', 10),
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
      'SELECT id, user_id, deck_builder_state, parent_pool_id FROM card_pools WHERE share_id = $1',
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
      if (pool.parent_pool_id !== null) {
        return errorResponse('Cannot change visibility of a build — change it on the parent pool', 403)
      }
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

    // Cascade visibility change to all child builds
    if (body.isPublic !== undefined) {
      await query(
        'UPDATE card_pools SET is_public = $1 WHERE parent_pool_id = $2',
        [body.isPublic, pool.id]
      )
    }

    // Notify connected clients viewing this pool tree that builds may have changed.
    // Anyone subscribed to pool-builds:<rootShareId> will re-fetch /api/pools/:rootShareId/builds.
    if (deckBuilderStateToSave !== undefined) {
      try {
        let rootShareId = result.rows[0].share_id
        if (pool.parent_pool_id) {
          const parent = await queryRow(
            'SELECT share_id FROM card_pools WHERE id = $1',
            [pool.parent_pool_id]
          )
          if (parent?.share_id) rootShareId = parent.share_id
        }
        const io = (global as { io?: { to(room: string): { emit(event: string): void } } }).io
        if (io && rootShareId) {
          io.to(`pool-builds:${rootShareId}`).emit('pool-builds-update')
        }
      } catch (broadcastErr) {
        console.warn('[pool PUT] failed to broadcast pool-builds-update', broadcastErr)
      }
    }

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
    const reparentTo = new URL(request.url).searchParams.get('reparent_to')

    const pool = await queryRow(
      'SELECT id, user_id, parent_pool_id FROM card_pools WHERE share_id = $1',
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    // Delete permissions:
    //   - A ROOT pool can only be deleted by its owner.
    //   - A BUILD (child deck) can be deleted by EITHER the person who built it
    //     (their deck, anywhere) OR the owner of its parent pool (anyone's deck
    //     on my pool). You can never delete someone else's deck on someone
    //     else's pool, nor someone else's pool.
    let canDelete = pool.user_id === session.id
    if (!canDelete && pool.parent_pool_id) {
      const parent = await queryRow(
        'SELECT user_id FROM card_pools WHERE id = $1',
        [pool.parent_pool_id]
      )
      if (parent && parent.user_id === session.id) canDelete = true
    }
    if (!canDelete) {
      return errorResponse('Unauthorized', 403)
    }

    // Reparent flow: caller is deleting a ROOT pool but wants to promote one of
    // their child builds to become the new root, preserving the pool's other
    // builds. Used by the per-deck trash UI when the owner has other builds.
    if (reparentTo && pool.parent_pool_id === null) {
      const target = await queryRow(
        'SELECT id, user_id, parent_pool_id FROM card_pools WHERE share_id = $1',
        [reparentTo]
      )
      if (!target) return errorResponse('Reparent target not found', 404)
      if (target.user_id !== session.id) return errorResponse('Unauthorized', 403)
      if (target.parent_pool_id !== pool.id) {
        return errorResponse('Reparent target must be a child of the pool being deleted', 400)
      }
      await query('UPDATE card_pools SET parent_pool_id = NULL WHERE id = $1', [target.id])
      await query(
        'UPDATE card_pools SET parent_pool_id = $1 WHERE parent_pool_id = $2 AND id != $1',
        [target.id, pool.id]
      )
      await query('DELETE FROM card_pools WHERE id = $1', [pool.id])
      return jsonResponse({ message: 'Pool root reassigned and old root deleted', newRootShareId: reparentTo })
    }

    // Root pool delete cascades to all child builds. Build delete is row-only.
    if (pool.parent_pool_id === null) {
      await query('DELETE FROM card_pools WHERE parent_pool_id = $1', [pool.id])
    }
    await query('DELETE FROM card_pools WHERE share_id = $1', [shareId])

    return jsonResponse({ message: 'Pool deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
