// @ts-nocheck
/**
 * POST /api/import/create
 *
 * Trust-boundary endpoint that takes the wizard's resolved selections,
 * re-runs server-side validation + assembly, re-checks the patron gate,
 * and INSERTs the pool. The wizard never POSTs to /api/pools directly —
 * doing so would let any logged-in non-patron bypass the extract gate
 * and write pool_type='imported' rows.
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U13.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { query, queryRow } from '@/lib/db'
import { generateShareId, jsonResponse, parseBody, handleApiError } from '@/lib/utils'
import { buildPool, type ResolvedRow } from '@/src/services/importPool/buildPool'
import { getCachedCards, initializeCardCache } from '@/src/utils/cardCache'
import { getSetConfig, getAllSetCodes } from '@/src/utils/setConfigs/index'
import type { RawCard } from '@/src/utils/cardData'
import { saveCreateCapture } from '@/lib/evalCapture'

export const dynamic = 'force-dynamic'

const MAX_TITLE_LENGTH = 80
const MAX_ROWS = 200

interface CreateRequestBody {
  setCode?: string
  /** Eval pairing — if provided, the user's final-corrected rows get
   *  written to /tmp/eval-captures/<sessionId>/ground-truth.json next to
   *  the photos the extract route saved earlier. */
  sessionId?: string
  resolvedRows?: Array<{
    cardId?: string  // The card.id (UUID) — we re-resolve to RawCard server-side
    poolQty?: number
    deckQty?: number
  }>
  activeLeaderId?: string
  activeBaseId?: string
  title?: string
  isDefaultName?: boolean
  isPublic?: boolean
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth: must be logged in.
    const session = getSession(request)
    if (!session) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    // 2. Auth: must be patron OR admin. is_patron is NOT in the JWT.
    if (!session.is_admin) {
      const user = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
      if (!user?.is_patron) {
        return jsonResponse(
          { error: 'Friends of the Pod required to import pools', code: 'PATRON_REQUIRED' },
          403,
        )
      }
    }

    // 3. Parse + validate body shape.
    const body = (await parseBody(request)) as CreateRequestBody
    const validationErrors: Array<{ code: string; message: string; detail?: any }> = []

    if (!body.setCode || typeof body.setCode !== 'string') {
      validationErrors.push({ code: 'INVALID_REQUEST', message: 'setCode required' })
    } else if (!getAllSetCodes().includes(body.setCode)) {
      validationErrors.push({ code: 'UNKNOWN_SET', message: `Unknown setCode "${body.setCode}"` })
    }

    if (!Array.isArray(body.resolvedRows) || body.resolvedRows.length === 0) {
      validationErrors.push({ code: 'INVALID_REQUEST', message: 'resolvedRows required' })
    } else if (body.resolvedRows.length > MAX_ROWS) {
      validationErrors.push({ code: 'TOO_MANY_ROWS', message: `Maximum ${MAX_ROWS} rows` })
    }

    if (!body.activeLeaderId || typeof body.activeLeaderId !== 'string') {
      validationErrors.push({ code: 'INVALID_REQUEST', message: 'activeLeaderId required' })
    }
    if (!body.activeBaseId || typeof body.activeBaseId !== 'string') {
      validationErrors.push({ code: 'INVALID_REQUEST', message: 'activeBaseId required' })
    }

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      validationErrors.push({ code: 'INVALID_REQUEST', message: 'title required' })
    } else if (title.length > MAX_TITLE_LENGTH) {
      validationErrors.push({
        code: 'TITLE_TOO_LONG',
        message: `Title must be ${MAX_TITLE_LENGTH} characters or less`,
      })
    } else if (title.startsWith('[PTP]')) {
      // The [PTP] prefix is added by SWUDB export, never by user input.
      validationErrors.push({
        code: 'INVALID_TITLE',
        message: 'Title must not start with [PTP] — the prefix is reserved for export',
      })
    }

    if (validationErrors.length > 0) {
      return jsonResponse({ error: 'VALIDATION_FAILED', details: validationErrors }, 422)
    }

    // 4. Re-resolve every cardId against the in-set DB. Defends against:
    //    (a) Client editing a row to point at a card not actually in the set.
    //    (b) Forged cardIds that don't exist in cards.json.
    await initializeCardCache().catch(() => {})
    const cards = getCachedCards(body.setCode!) || []
    const cardById = new Map<string, RawCard>(cards.map((c) => [c.id, c]))

    const resolvedRows: ResolvedRow[] = []
    for (let i = 0; i < body.resolvedRows!.length; i++) {
      const row = body.resolvedRows![i]
      if (!row || typeof row.cardId !== 'string') {
        validationErrors.push({ code: 'INVALID_REQUEST', message: `rows[${i}] missing cardId` })
        continue
      }
      const card = cardById.get(row.cardId)
      if (!card) {
        validationErrors.push({
          code: 'UNKNOWN_CARD',
          message: `Card "${row.cardId}" not in set ${body.setCode}`,
          detail: { rowIndex: i, cardId: row.cardId },
        })
        continue
      }
      const poolQty = Number(row.poolQty)
      const deckQty = Number(row.deckQty)
      if (!Number.isInteger(poolQty) || poolQty < 0 || poolQty > 6) {
        validationErrors.push({
          code: 'INVALID_QTY',
          message: `rows[${i}] poolQty must be integer 0-6`,
          detail: { rowIndex: i, poolQty: row.poolQty },
        })
        continue
      }
      if (!Number.isInteger(deckQty) || deckQty < 0 || deckQty > 6) {
        validationErrors.push({
          code: 'INVALID_QTY',
          message: `rows[${i}] deckQty must be integer 0-6`,
          detail: { rowIndex: i, deckQty: row.deckQty },
        })
        continue
      }
      resolvedRows.push({ card, poolQty, deckQty })
    }

    if (validationErrors.length > 0) {
      return jsonResponse({ error: 'VALIDATION_FAILED', details: validationErrors }, 422)
    }

    // 5. Run pool assembly (this also enforces the 96-card invariant).
    const result = buildPool({
      resolvedRows,
      activeLeaderId: body.activeLeaderId!,
      activeBaseId: body.activeBaseId!,
      setCode: body.setCode!,
      poolName: title,
      isDefaultName: body.isDefaultName === true,
    })

    if (result.validationErrors.length > 0) {
      return jsonResponse(
        { error: 'VALIDATION_FAILED', details: result.validationErrors },
        422,
      )
    }

    // 6. INSERT into card_pools. Mirrors the shape used by app/api/pools/route.ts.
    const setConfig = getSetConfig(body.setCode!)
    const setName = setConfig?.setName || body.setCode!
    let shareId = generateShareId(8)
    let attempts = 0
    const maxAttempts = 10
    let inserted: any = null

    while (attempts < maxAttempts) {
      try {
        const dbResult = await query(
          `INSERT INTO card_pools (
             user_id, share_id, set_code, set_name, pool_type, name,
             cards, packs, deck_builder_state, is_public, hidden
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, share_id, created_at`,
          [
            session.id,
            shareId,
            body.setCode!,
            setName,
            'imported',
            title,
            JSON.stringify(result.cards),
            null, // packs — imported pools have no pack structure
            JSON.stringify(result.deckBuilderState),
            body.isPublic === true,
            false,
          ],
        )
        inserted = dbResult.rows[0]
        break
      } catch (err: any) {
        // Retry on share_id collision
        if (
          err?.code === '23505' ||
          (err?.message && (err.message.includes('duplicate key') || err.message.includes('UNIQUE constraint')))
        ) {
          shareId = generateShareId(8)
          attempts++
          continue
        }
        throw err
      }
    }

    if (!inserted) {
      throw new Error('Failed to generate unique share ID after multiple attempts')
    }

    // Eval data capture: write the user's final-corrected rows to the same
    // /tmp/eval-captures/<sessionId>/ directory the extract route used for
    // the photos. Lets us turn real submissions into golden fixtures.
    if (body.sessionId && typeof body.sessionId === 'string') {
      // resolvedRows here is the SERVER-resolved shape: { card, poolQty,
      // deckQty } where card is a RawCard. Earlier this code was reading
      // r.cardId (which doesn't exist on this shape) and producing empty
      // truth rows.
      const truthRows = resolvedRows.map((r) => ({
        name: r.card.name,
        subtitle: r.card.subtitle || null,
        type: r.card.type,
        poolQty: r.poolQty,
        deckQty: r.deckQty,
      }))
      saveCreateCapture(body.sessionId, {
        meta: {
          setCode: body.setCode,
          shareId: inserted.share_id,
          title: title,
          activeLeaderId: body.activeLeaderId,
          activeBaseId: body.activeBaseId,
          createdAt: inserted.created_at,
          userId: session.id,
        },
        rows: truthRows,
      })
    }

    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    return jsonResponse(
      {
        id: inserted.id,
        shareId: inserted.share_id,
        shareUrl: `${APP_URL}/pool/${inserted.share_id}/deck`,
        createdAt: inserted.created_at,
      },
      201,
    )
  } catch (error) {
    return handleApiError(error as Error)
  }
}
