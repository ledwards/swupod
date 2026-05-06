// @ts-nocheck
/**
 * POST /api/import/extract
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
import { extractPoolFromImages, computeSectionGaps, type RawExtractResponse } from '@/lib/anthropic'
import { matchExtractedRows } from '@/src/services/importPool/cardMatcher'
import { getCachedCards, initializeCardCache } from '@/src/utils/cardCache'
import { getSetConfig, getAllSetCodes } from '@/src/utils/setConfigs/index'
import { appendFileSync } from 'fs'

// Local-dev observability for prompt-tuning iteration. Each request appends
// its summary to /tmp/import-attempts.log so we can tail it while iterating
// on the prompt or the matcher.
const ATTEMPT_LOG = '/tmp/import-attempts.log'
function logAttempt(line: string) {
  try {
    appendFileSync(ATTEMPT_LOG, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
  } catch {
    // ignore — file logging is best-effort
  }
}

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

    // 4. Call Claude. Single-shot extraction — runtime self-correction was
    //    pulled out in favour of collaborative prompt iteration (see
    //    lib/anthropic.ts comment).
    logAttempt(`=== EXTRACTION REQUEST (user=${session.id}) ===`)
    let raw: any
    try {
      raw = await extractPoolFromImages(
        body.images.map((img) => ({ data: img.data, mediaType: img.mediaType as any })),
        body.manualSetCode ? { setHint: body.manualSetCode } : {},
      )
      // Log final extraction summary so we can see what each row got mapped to
      const ldrs = raw.rows.filter((r: any) => r.type === 'Leader' && r.poolQty > 0)
      const bs = raw.rows.filter((r: any) => r.type === 'Base' && r.poolQty > 0)
      const others = raw.rows.filter((r: any) => r.type !== 'Leader' && r.type !== 'Base' && r.poolQty > 0)
      const sumPool = raw.rows.reduce((s: number, r: any) => s + (Number(r.poolQty) || 0), 0)
      const sumDeck = raw.rows.reduce((s: number, r: any) => s + (Number(r.deckQty) || 0), 0)
      logAttempt(`final: setCode=${raw.header?.setCode || '?'} sumPool=${sumPool} sumDeck=${sumDeck}`)
      logAttempt(`final: leaders(pool>0)=${ldrs.length} bases(pool>0)=${bs.length} other-rows(pool>0)=${others.length}`)
      logAttempt(`leaders: ${ldrs.map((r: any) => `${r.name}:${r.poolQty}/${r.deckQty}`).join(', ')}`)
      logAttempt(`bases: ${bs.map((r: any) => `${r.name}:${r.poolQty}/${r.deckQty}`).join(', ')}`)
      logAttempt(`others: ${others.map((r: any) => `${r.name}:${r.poolQty}/${r.deckQty}`).join(', ')}`)
    } catch (err) {
      logAttempt(`THROWN: ${(err as Error).message}`)
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

    // 5. Sanitize response. Per-row issues become warnings (carried to the
    //    Resolve step) rather than blocking. Only structural failures abort.
    const sanitizationResult = sanitizeRawResponse(raw)
    if ('fatal' in sanitizationResult) {
      return jsonResponse(
        { error: sanitizationResult.fatal, code: 'EXTRACTION_INVALID_SCHEMA' },
        502,
      )
    }
    const { sanitized, warnings: extractWarnings } = sanitizationResult
    raw = sanitized as RawExtractResponse

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
        extractConfidence: r.extractConfidence,
      })),
      cards,
    })

    // Compute final section gaps (under/over-populated sections vs typical
    // sealed-pool ranges) so the client can surface them as anomalies in the
    // error pager.
    const sectionGaps = computeSectionGaps(raw)

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
      warnings: extractWarnings,
      sectionGaps,
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

type SanitizationResult =
  | { fatal: string }
  | { sanitized: { header: any; rows: any[] }; warnings: string[] }

/**
 * Permissive shape sanitizer. Per-row issues become warnings (carried to the
 * Resolve step) rather than blocking the whole extraction. Only structural
 * failures (no header, no rows array) are fatal.
 *
 * Still preserves prompt-injection bounds — qty values are clamped, unknown
 * types and missing names are dropped, oversize row arrays are truncated.
 */
function sanitizeRawResponse(raw: any): SanitizationResult {
  if (!raw || typeof raw !== 'object') return { fatal: 'Response is not an object' }
  if (!raw.header || typeof raw.header !== 'object') return { fatal: 'Response missing header' }
  if (!Array.isArray(raw.rows)) return { fatal: 'Response missing rows array' }

  const warnings: string[] = []
  let droppedNoName = 0
  let droppedBadType = 0
  let droppedBadStructure = 0
  let clampedQty = 0

  let rowsToProcess: any[] = raw.rows
  if (raw.rows.length > MAX_ROWS) {
    warnings.push(`${raw.rows.length - MAX_ROWS} rows beyond the ${MAX_ROWS} limit were dropped`)
    rowsToProcess = raw.rows.slice(0, MAX_ROWS)
  }

  const sanitizedRows: any[] = []
  for (const row of rowsToProcess) {
    if (!row || typeof row !== 'object') {
      droppedBadStructure++
      continue
    }
    if (typeof row.name !== 'string' || row.name.trim().length === 0) {
      droppedNoName++
      continue
    }
    if (!VALID_TYPES.has(row.type)) {
      droppedBadType++
      continue
    }

    let poolQty = Number.isInteger(row.poolQty) ? row.poolQty : 0
    let deckQty = Number.isInteger(row.deckQty) ? row.deckQty : 0
    const origPool = poolQty
    const origDeck = deckQty

    poolQty = Math.max(0, Math.min(MAX_QTY, poolQty))
    deckQty = Math.max(0, Math.min(MAX_QTY, deckQty))
    if (deckQty > poolQty) deckQty = poolQty

    if (origPool !== poolQty || origDeck !== deckQty) clampedQty++

    sanitizedRows.push({
      ...row,
      poolQty,
      deckQty,
      subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
    })
  }

  if (droppedNoName > 0) warnings.push(`${droppedNoName} row${droppedNoName === 1 ? '' : 's'} with missing card names dropped`)
  if (droppedBadType > 0) warnings.push(`${droppedBadType} row${droppedBadType === 1 ? '' : 's'} with unrecognized card types dropped`)
  if (droppedBadStructure > 0) warnings.push(`${droppedBadStructure} malformed row${droppedBadStructure === 1 ? '' : 's'} dropped`)
  if (clampedQty > 0) warnings.push(`${clampedQty} row${clampedQty === 1 ? '' : 's'} had quantities clamped to the 0-${MAX_QTY} range`)

  return { sanitized: { header: raw.header, rows: sanitizedRows }, warnings }
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
