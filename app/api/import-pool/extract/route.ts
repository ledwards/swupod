// @ts-nocheck
/**
 * POST /api/import-pool/extract
 *
 * Accepts up to 2 base64-encoded images of a competitive sealed registration
 * sheet. Calls Claude vision via lib/anthropic.ts, validates the response
 * shape against a strict schema (prompt-injection mitigation), runs the
 * server-side card matcher, and returns matched rows ready for the wizard
 * Resolve step.
 *
 * Friends-of-the-Pod gated. is_patron is NOT in the JWT — must hit the DB.
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, parseBody, handleApiError } from '@/lib/utils'
import { extractPoolFromImages, type RawExtractResponse } from '@/lib/anthropic'
import { matchExtractedRows } from '@/src/services/importPool/cardMatcher'
import { getCachedCards, initializeCardCache } from '@/src/utils/cardCache'
import { getSetConfig, getAllSetCodes } from '@/src/utils/setConfigs/index'

// Cap upload payload at the platform layer. The handler still rejects >2 images
// and oversized payloads, but the platform-level limit is what protects memory
// when a malicious client tries to send 100MB.
export const maxDuration = 60 // seconds; vision can be slow
export const dynamic = 'force-dynamic'

const MAX_IMAGES = 2
const MAX_TOTAL_BYTES = 10 * 1024 * 1024 // 10MB combined
const VALID_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const VALID_TYPES = new Set(['Leader', 'Base', 'Unit', 'Event', 'Upgrade'])
const MAX_QTY = 6
// LAW has ~257 cards across all rarities; sheets list every set card with the
// player marking poolQty on the ~80 they actually own. 500 is safe across all
// known sets (largest is LAW; SOR has ~250).
const MAX_ROWS = 500

interface ExtractRequestBody {
  images?: Array<{ data: string; mediaType: string }>
  manualSetCode?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth: must be logged in.
    const session = getSession(request)
    if (!session) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    // 2. Auth: must be patron OR admin. is_patron is NOT in the JWT — must
    //    query the DB. Mirror app/api/draft/route.ts:34-39.
    if (!session.is_admin) {
      const user = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
      if (!user?.is_patron) {
        return jsonResponse(
          { error: 'Friends of the Pod required to import pools', code: 'PATRON_REQUIRED' },
          403,
        )
      }
    }

    // 3. Parse + validate body.
    const body = (await parseBody(request)) as ExtractRequestBody
    if (!body || !Array.isArray(body.images) || body.images.length === 0) {
      return jsonResponse(
        { error: 'Request must include at least 1 image', code: 'INVALID_REQUEST' },
        400,
      )
    }
    if (body.images.length > MAX_IMAGES) {
      return jsonResponse(
        { error: `Up to ${MAX_IMAGES} images supported per request`, code: 'TOO_MANY_IMAGES' },
        400,
      )
    }

    let totalBytes = 0
    for (const img of body.images) {
      if (!img || typeof img.data !== 'string' || typeof img.mediaType !== 'string') {
        return jsonResponse(
          { error: 'Each image must have { data, mediaType }', code: 'INVALID_IMAGE_SHAPE' },
          400,
        )
      }
      if (!VALID_MIMES.has(img.mediaType)) {
        return jsonResponse(
          {
            error: `Unsupported image type "${img.mediaType}". Allowed: ${[...VALID_MIMES].join(', ')}`,
            code: 'UNSUPPORTED_MIME',
          },
          400,
        )
      }
      // Approx bytes: base64 → 3/4. We don't decode here; this is a defensive bound.
      totalBytes += Math.ceil((img.data.length * 3) / 4)
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonResponse(
        { error: `Total image payload exceeds ${MAX_TOTAL_BYTES} bytes`, code: 'PAYLOAD_TOO_LARGE' },
        413,
      )
    }

    // 4. Call Claude.
    let raw: RawExtractResponse
    try {
      raw = await extractPoolFromImages(
        body.images.map((img) => ({ data: img.data, mediaType: img.mediaType as any })),
        body.manualSetCode ? { setHint: body.manualSetCode } : {},
      )
    } catch (err) {
      console.error('Anthropic extraction failed:', err)
      const message = err instanceof Error ? err.message : 'Unknown extraction error'
      // Distinguish JSON-shape failures from upstream API failures
      if (
        message.includes('not valid JSON') ||
        message.includes('missing required header/rows') ||
        message.includes('no text content')
      ) {
        return jsonResponse(
          { error: message, code: 'EXTRACTION_INVALID_JSON' },
          502,
        )
      }
      return jsonResponse(
        { error: message, code: 'EXTRACTION_UPSTREAM_ERROR' },
        502,
      )
    }

    // 5. Validate response shape strictly (prompt-injection mitigation).
    const shapeError = validateRawResponse(raw)
    if (shapeError) {
      return jsonResponse(
        { error: shapeError, code: 'EXTRACTION_INVALID_SCHEMA' },
        502,
      )
    }

    // 6. Resolve setCode. Either manualSetCode (validated against getAllSetCodes()) or
    //    auto-detect from the header by fuzzy-matching set name to setConfigs.
    let setCode: string | null = null
    if (body.manualSetCode) {
      if (!getAllSetCodes().includes(body.manualSetCode)) {
        return jsonResponse(
          { error: `Unknown setCode "${body.manualSetCode}"`, code: 'UNKNOWN_SET' },
          400,
        )
      }
      setCode = body.manualSetCode
    } else {
      setCode = resolveSetCodeFromName(raw.header.setName)
      if (!setCode) {
        return jsonResponse(
          {
            error: 'Could not detect set from sheet header. Please pick a set manually.',
            code: 'SET_DETECTION_FAILED',
            setCandidates: getAllSetCodes(),
            detectedSetName: raw.header.setName,
          },
          422,
        )
      }
    }

    // 7. Match rows to in-app card DB.
    await initializeCardCache().catch(() => {
      /* cache uses bundled JSON; init is a no-op fallback */
    })
    const cards = getCachedCards(setCode) || []
    const matched = matchExtractedRows({
      rows: raw.rows.map((r) => ({
        name: r.name,
        type: r.type,
        subtitle: r.subtitle,
        poolQty: r.poolQty,
        deckQty: r.deckQty,
      })),
      cards,
    })

    return jsonResponse({
      header: {
        setCode,
        setName: getSetConfig(setCode)?.setName || raw.header.setName,
        eventName: raw.header.eventName,
        eventDate: raw.header.eventDate,
        playerName: raw.header.playerName,
        leader: raw.header.leader,
        base: raw.header.base,
      },
      rows: matched.map((m) => ({
        extracted: m.extracted,
        matched: m.matched
          ? {
              id: m.matched.id,
              cardId: m.matched.cardId,
              name: m.matched.name,
              subtitle: m.matched.subtitle,
              type: m.matched.type,
              aspects: m.matched.aspects,
              imageUrl: m.matched.imageUrl,
              isLeader: m.matched.isLeader,
              isBase: m.matched.isBase,
            }
          : null,
        candidates: m.candidates.map((c) => ({
          id: c.id,
          cardId: c.cardId,
          name: c.name,
          subtitle: c.subtitle,
          type: c.type,
          aspects: c.aspects,
          imageUrl: c.imageUrl,
          isLeader: c.isLeader,
          isBase: c.isBase,
        })),
        confidence: m.confidence,
      })),
    })
  } catch (error) {
    return handleApiError(error as Error)
  }
}

// === Helpers ===

function validateRawResponse(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return 'Response is not an object'
  if (!raw.header || typeof raw.header !== 'object') return 'Response missing header'
  if (!Array.isArray(raw.rows)) return 'Response missing rows array'
  if (raw.rows.length > MAX_ROWS) return `Too many rows (${raw.rows.length} > ${MAX_ROWS})`

  for (let i = 0; i < raw.rows.length; i++) {
    const row = raw.rows[i]
    if (!row || typeof row !== 'object') return `rows[${i}] is not an object`
    if (typeof row.name !== 'string' || row.name.length === 0) {
      return `rows[${i}] has invalid name`
    }
    if (!VALID_TYPES.has(row.type)) {
      return `rows[${i}] has invalid type "${row.type}"`
    }
    if (row.subtitle !== null && typeof row.subtitle !== 'string') {
      return `rows[${i}] has invalid subtitle`
    }
    if (
      typeof row.poolQty !== 'number' ||
      !Number.isInteger(row.poolQty) ||
      row.poolQty < 0 ||
      row.poolQty > MAX_QTY
    ) {
      return `rows[${i}] poolQty out of bounds (0-${MAX_QTY})`
    }
    if (
      typeof row.deckQty !== 'number' ||
      !Number.isInteger(row.deckQty) ||
      row.deckQty < 0 ||
      row.deckQty > MAX_QTY
    ) {
      return `rows[${i}] deckQty out of bounds (0-${MAX_QTY})`
    }
    if (row.deckQty > row.poolQty) {
      return `rows[${i}] deckQty (${row.deckQty}) > poolQty (${row.poolQty})`
    }
  }
  return null
}

function resolveSetCodeFromName(setName: string | null): string | null {
  if (!setName) return null
  const lower = setName.toLowerCase()
  for (const code of getAllSetCodes()) {
    const config = getSetConfig(code)
    if (!config) continue
    if (config.setName.toLowerCase() === lower) return code
    // Substring match — handles "A Lawless Time" vs "Lawless Time"
    if (lower.includes(config.setName.toLowerCase())) return code
    if (config.setName.toLowerCase().includes(lower)) return code
    // Set-code direct match (e.g. "LAW")
    if (lower.includes(code.toLowerCase())) return code
  }
  return null
}
