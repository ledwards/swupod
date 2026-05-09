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
import {
  extractPoolFromImages,
  extractPoolFromImagesWholeTable,
  computeSectionGaps,
  type RawExtractResponse,
} from '@/lib/anthropic'
import { matchExtractedRows } from '@/src/services/importPool/cardMatcher'
import { getCachedCards, initializeCardCache } from '@/src/utils/cardCache'
import { getSetConfig, getAllSetCodes } from '@/src/utils/setConfigs/index'
import { appendFileSync } from 'fs'
import { deriveSessionId, saveExtractCapture } from '@/lib/evalCapture'

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
//
// 1800s = 30 minutes. The 8-iteration refine loop on a tough sheet can take
// 25+ minutes (each pass is a 32K-token vision stream over a 4MB upload,
// 3-4 minutes typical, plus retry-on-terminated overhead). Railway honors
// long-running requests; on Vercel this caps per platform tier.
export const maxDuration = 1800
export const dynamic = 'force-dynamic'

const MAX_IMAGES = 2
// Client uploads originals (no re-encoding) for OMR/Claude fidelity.
// 24MP iPhone JPEGs are ~7-10MB each; allow 30MB combined to fit two of
// them with headroom. The server's `preprocessImageForExtraction` then
// sharp-downsamples to 2576px before sending to Claude — so this is upload
// budget only, not memory.
const MAX_TOTAL_BYTES = 30 * 1024 * 1024 // 30MB combined
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
    //    Primary path: whole-table OMR + per-table Opus calls
    //    (~97% per-cell accuracy, $0.55-0.69/import, ~12-45s wall time).
    //    On Python-sidecar/Claude failure, automatic fallback to the
    //    legacy multi-sample sub-aspect refine loop. The fallback exists
    //    purely for Python install / OS / API outage edge cases — not
    //    as a quality knob. If quality regresses we revert via git.
    //    See plans/IMPORT_POOL_OMR_REPORT.md for full eval data.
    logAttempt(`=== EXTRACTION REQUEST (user=${session.id}) ===`)
    let raw: any
    let extractIterations: any[] = []
    let converged = false
    let bestIteration = 0
    try {
      const imagesIn = body.images.map((img) => ({ data: img.data, mediaType: img.mediaType as any }))
      const opts = body.manualSetCode ? { setHint: body.manualSetCode } : {}
      let extractResult
      try {
        extractResult = await extractPoolFromImagesWholeTable(imagesIn, opts)
      } catch (wtErr) {
        logAttempt(`whole-table failed, falling back to legacy: ${(wtErr as Error).message}`)
        console.warn(
          '[import/extract] whole-table extraction failed, falling back to legacy multi-sample:',
          (wtErr as Error).message,
        )
        extractResult = await extractPoolFromImages(imagesIn, opts)
      }
      raw = extractResult.result
      extractIterations = extractResult.iterations
      converged = extractResult.converged
      bestIteration = extractResult.bestIteration

      // Per-iteration log line: one line per pass with the invariant counts.
      // Comparing iteration N to iteration N-1 tells us whether refine prompts
      // are actually moving the needle, or whether tweaks are no-ops.
      for (const it of extractIterations) {
        logAttempt(
          `iter ${it.iteration}: pool=${it.poolSum}/96 deck=${it.deckSum} leaders=${it.leaderCount}/6 bases=${it.baseCount}/6 subset=${it.subsetViolations} passing=${it.passing} cache(r/w)=${it.cacheReadTokens}/${it.cacheCreationTokens} out=${it.outputTokens}`,
        )
        if (!it.passing && it.failures.length > 0) {
          logAttempt(`iter ${it.iteration} failures: ${it.failures.join(' | ')}`)
        }
      }
      logAttempt(
        `loop: converged=${converged} bestIteration=${bestIteration} totalIterations=${extractIterations.length}`,
      )
      // Log final extraction summary so we can see what each row got mapped to.
      // Format: "Name:pool/deck[poolConf/deckConf]" where conf is H|M|L|?.
      const confChar = (c: string | undefined): string =>
        c === 'high' ? 'H' : c === 'medium' ? 'M' : c === 'low' ? 'L' : '?'
      const fmt = (r: any) =>
        `${r.name}:${r.poolQty}/${r.deckQty}[${confChar(r.poolQtyConfidence)}/${confChar(r.deckQtyConfidence)}]`

      const ldrs = raw.rows.filter((r: any) => r.type === 'Leader' && r.poolQty > 0)
      const bs = raw.rows.filter((r: any) => r.type === 'Base' && r.poolQty > 0)
      const others = raw.rows.filter((r: any) => r.type !== 'Leader' && r.type !== 'Base' && r.poolQty > 0)
      const sumPool = raw.rows.reduce((s: number, r: any) => s + (Number(r.poolQty) || 0), 0)
      const sumDeck = raw.rows.reduce((s: number, r: any) => s + (Number(r.deckQty) || 0), 0)

      // Confidence histogram across ALL rows (pool>0 AND blanks) so we can see
      // both kinds of failures: low conf on a marked row (count is uncertain)
      // and low conf on a blank (Claude isn't sure it's empty — possible
      // missed card).
      const histo = (key: 'poolQtyConfidence' | 'deckQtyConfidence') => {
        const c = { H: 0, M: 0, L: 0, '?': 0 }
        for (const r of raw.rows) c[confChar(r[key]) as keyof typeof c]++
        return `H=${c.H} M=${c.M} L=${c.L} ?=${c['?']}`
      }
      logAttempt(`final: setCode=${raw.header?.setCode || '?'} sumPool=${sumPool} sumDeck=${sumDeck}`)
      logAttempt(`final: leaders(pool>0)=${ldrs.length} bases(pool>0)=${bs.length} other-rows(pool>0)=${others.length}`)
      logAttempt(`final: poolConf ${histo('poolQtyConfidence')}`)
      logAttempt(`final: deckConf ${histo('deckQtyConfidence')}`)

      // Surface the rows the user is supposed to verify: any row where Claude
      // marked LOW confidence on either column. These are our debugging gold
      // — if we're missing cards, they should show up here.
      const lowConfRows = raw.rows.filter(
        (r: any) => r.poolQtyConfidence === 'low' || r.deckQtyConfidence === 'low',
      )
      if (lowConfRows.length > 0) {
        logAttempt(`low-conf rows (${lowConfRows.length}): ${lowConfRows.map(fmt).join(', ')}`)
      }

      logAttempt(`leaders: ${ldrs.map(fmt).join(', ')}`)
      logAttempt(`bases: ${bs.map(fmt).join(', ')}`)
      logAttempt(`others: ${others.map(fmt).join(', ')}`)
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
        poolQtyConfidence: r.poolQtyConfidence,
        deckQtyConfidence: r.deckQtyConfidence,
      })),
      cards,
    })

    // Compute final section gaps (under/over-populated sections vs typical
    // sealed-pool ranges) so the client can surface them as anomalies in the
    // error pager.
    const sectionGaps = computeSectionGaps(raw)

    // Sanitize Claude's section bounds: drop anything malformed, clamp coords
    // to [0, 1] so a stray 1.05 doesn't break clipping math on the client.
    const VALID_SECTION_NAMES = new Set([
      'Leaders', 'Bases', 'Vigilance', 'Command', 'Aggression', 'Cunning',
      'Heroism', 'Villainy', 'Multicolor', 'NoAspect',
    ])
    // Log raw payload first so we can tell whether Claude returned an empty
    // array OR something the sanitizer dropped (wrong field names, out-of-range
    // photoIndex, NaN coords, etc.) — different failure modes need different
    // prompt fixes.
    const rawSectionsCount = Array.isArray(raw.sections) ? raw.sections.length : -1
    logAttempt(`raw sections from Claude: count=${rawSectionsCount} ${JSON.stringify(raw.sections ?? null).slice(0, 600)}`)
    const sections = Array.isArray(raw.sections)
      ? raw.sections
          .filter((s: any) =>
            s &&
            VALID_SECTION_NAMES.has(s.name) &&
            Number.isInteger(s.photoIndex) &&
            s.photoIndex >= 0 &&
            s.photoIndex < body.images.length &&
            ['x0', 'y0', 'x1', 'y1'].every((k) => Number.isFinite(s[k])),
          )
          .map((s: any) => ({
            name: s.name,
            photoIndex: s.photoIndex,
            x0: Math.max(0, Math.min(1, s.x0)),
            y0: Math.max(0, Math.min(1, s.y0)),
            x1: Math.max(0, Math.min(1, s.x1)),
            y1: Math.max(0, Math.min(1, s.y1)),
          }))
          .filter((s: any) => s.x1 > s.x0 && s.y1 > s.y0)
      : []
    if (rawSectionsCount > 0 && sections.length < rawSectionsCount) {
      logAttempt(`sections sanitizer dropped ${rawSectionsCount - sections.length} of ${rawSectionsCount} entries`)
    }
    logAttempt(`final: sections=${sections.length} (${sections.map((s: any) => `${s.name}/p${s.photoIndex}`).join(', ')})`)
    if (sectionGaps.length > 0) {
      logAttempt(`final: sectionGaps=${sectionGaps.length} ${sectionGaps.map((g: any) => `${g.section}:${g.count}`).join(', ')}`)
    }

    // Eval data capture: dump the photos + the post-sanitize extraction
    // alongside a deterministic sessionId (userId + photo-content hash) so
    // re-uploads of the same photo OVERWRITE in R2 rather than fan out into
    // duplicate directories. /api/import/create writes ground-truth.json
    // into the same directory.
    const sessionId = deriveSessionId(session.id, body.images)
    saveExtractCapture(
      sessionId,
      body.images.map((img) => ({ data: img.data, mediaType: img.mediaType })),
      { header: raw.header, rows: raw.rows, sections, sectionGaps },
    )

    return jsonResponse({
      sessionId,
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
      sections,
      iterations: extractIterations,
      converged,
      bestIteration,
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
  | { sanitized: { header: any; rows: any[]; sections: any[] }; warnings: string[] }

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

  if (droppedNoName > 0) warnings.push(`Skipped ${droppedNoName} row${droppedNoName === 1 ? '' : 's'} the model couldn't read a card name for. Verify the source photo if your pool count looks short.`)
  if (droppedBadType > 0) warnings.push(`Skipped ${droppedBadType} row${droppedBadType === 1 ? '' : 's'} where the card type wasn't recognized.`)
  if (droppedBadStructure > 0) warnings.push(`Skipped ${droppedBadStructure} malformed row${droppedBadStructure === 1 ? '' : 's'} the model returned in an unexpected shape.`)
  if (clampedQty > 0) warnings.push(`The model returned an out-of-range count (above ${MAX_QTY}) on ${clampedQty} row${clampedQty === 1 ? '' : 's'}; capped at ${MAX_QTY}. Likely a misread — double-check those rows.`)

  // Pass `sections` through untouched — the route handler runs its own
  // section-coords sanitizer (VALID_SECTION_NAMES, photoIndex bounds,
  // x0/y0/x1/y1 numeric checks) at line 316. Without this passthrough,
  // OMR-derived section bounds get stripped by this row-focused sanitizer
  // and the resolve UI's "view this section" button falls through to
  // showing the full sheet.
  return {
    sanitized: { header: raw.header, rows: sanitizedRows, sections: raw.sections || [] },
    warnings,
  }
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
