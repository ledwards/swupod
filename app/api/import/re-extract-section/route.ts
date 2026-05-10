// @ts-nocheck
/**
 * POST /api/import/re-extract-section
 *
 * Targeted re-extraction for ONE section (Leaders / Bases / Vigilance / ...).
 * The wizard's resolve step shows the user a re-extract button per section;
 * when clicked, this endpoint re-runs the OMR sidecar on the original photos,
 * picks just the requested table's crop, and sends a single Claude call to
 * re-classify the cells. Returns the updated rows for that section so the
 * client can replace its local state for those cards.
 *
 * Cost: ~1 Claude call (~$0.05-0.07) and ~10-20s wall time, vs the full
 * extract route's 8-10 calls (~$0.55) and 45-60s.
 *
 * Friends-of-the-Pod gated, same as /api/import/extract.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, parseBody, handleApiError } from '@/lib/utils'
import { fetchPhoto } from '@/lib/photoStorage'
import { runOmrSidecar, classifyTableWithClaude } from '@/src/services/importPool/omrExtraction'
import { groupCardsByTable, TABLE_NAMES, type TableName } from '@/src/services/importPool/tableGrouping'
import { getCachedCards, initializeCardCache } from '@/src/utils/cardCache'
import { getAllSetCodes } from '@/src/utils/setConfigs/index'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VALID_MIMES_AT_INPUT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

interface ReExtractBody {
  photoKeys?: string[]
  sectionName?: string
  setCode?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth: must be logged in patron OR admin (mirrors /api/import/extract).
    const session = getSession(request)
    if (!session) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }
    if (!session.is_admin) {
      const user = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
      if (!user?.is_patron) {
        return jsonResponse(
          { error: 'Friends of the Pod required to re-extract', code: 'PATRON_REQUIRED' },
          403,
        )
      }
    }

    // Body validation
    const body = (await parseBody(request)) as ReExtractBody
    if (!body || !Array.isArray(body.photoKeys) || body.photoKeys.length === 0) {
      return jsonResponse(
        { error: 'photoKeys[] required', code: 'INVALID_REQUEST' },
        400,
      )
    }
    if (body.photoKeys.length > 2) {
      return jsonResponse(
        { error: 'Up to 2 photos supported', code: 'TOO_MANY_PHOTOS' },
        400,
      )
    }
    if (!body.sectionName || !(TABLE_NAMES as string[]).includes(body.sectionName)) {
      return jsonResponse(
        {
          error: `sectionName must be one of: ${TABLE_NAMES.join(', ')}`,
          code: 'INVALID_SECTION',
        },
        400,
      )
    }
    if (!body.setCode || !getAllSetCodes().includes(body.setCode)) {
      return jsonResponse(
        { error: 'valid setCode required', code: 'INVALID_REQUEST' },
        400,
      )
    }
    const sectionName = body.sectionName as TableName
    const setCode = body.setCode

    // Fetch photos. Same HEIC-to-JPEG handling as /api/import/extract — older
    // uploads in storage may still be HEIC if they predate the upload-photo
    // server-side conversion change.
    const buffers: Buffer[] = []
    for (const key of body.photoKeys) {
      const { buffer, contentType } = await fetchPhoto(key)
      let outBuffer = buffer
      if (contentType === 'image/heic' || contentType === 'image/heif') {
        const convert = (await import('heic-convert')).default
        const ab = await convert({ buffer, format: 'JPEG', quality: 0.85 })
        outBuffer = Buffer.from(ab)
      } else if (!VALID_MIMES_AT_INPUT.has(contentType)) {
        return jsonResponse(
          { error: `Unsupported stored type "${contentType}"`, code: 'UNSUPPORTED_MIME' },
          400,
        )
      }
      buffers.push(outBuffer)
    }

    // Run OMR sidecar to get the section's cropped table image. Cheap (~3-5s,
    // local Python). We re-run instead of caching the original sidecar output
    // because that output is in-memory only on the original extract call.
    const sidecar = await runOmrSidecar(buffers)
    const tableMatch = sidecar.tables.find((t) => t.name === sectionName)
    if (!tableMatch) {
      return jsonResponse(
        {
          error: `Section "${sectionName}" not detected in the photos. Try re-uploading the source photos.`,
          code: 'SECTION_NOT_DETECTED',
        },
        422,
      )
    }

    // Closed vocab for this table from the bundled card cache
    await initializeCardCache().catch(() => {})
    const allCards = (getCachedCards(setCode) || []).filter(
      (c: any) => c.variantType === 'Normal',
    )
    const tableGroups = groupCardsByTable(allCards)
    const tableCards = tableGroups.get(sectionName) || []
    if (tableCards.length === 0) {
      return jsonResponse(
        { error: `No cards in set ${setCode} table ${sectionName}`, code: 'EMPTY_TABLE' },
        500,
      )
    }

    // Single per-table Claude call
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    const client = new Anthropic({ apiKey })

    const start = Date.now()
    const rows = await classifyTableWithClaude(client, sectionName, tableCards, tableMatch.image_b64)
    const elapsedMs = Date.now() - start

    // Map cardNumber back to full card info so the client can merge by card.id
    const cardByNumber = new Map<number, any>()
    for (const c of tableCards) {
      const n = Number(c.number)
      if (Number.isFinite(n)) cardByNumber.set(n, c)
    }
    const updatedRows = rows
      .map((r) => {
        const card = cardByNumber.get(r.cardNumber)
        if (!card) return null
        return {
          cardId: card.id,
          name: card.name,
          subtitle: card.subtitle || null,
          type: card.type,
          aspects: card.aspects || [],
          poolQty: r.poolQty,
          deckQty: r.deckQty,
          poolQtyConfidence: r.poolUnclear ? 'low' : 'high',
          deckQtyConfidence: r.deckUnclear ? 'low' : 'high',
        }
      })
      .filter(Boolean)

    return jsonResponse({
      sectionName,
      rows: updatedRows,
      elapsedMs,
    })
  } catch (error) {
    return handleApiError(error as Error)
  }
}
