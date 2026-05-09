// @ts-nocheck
/**
 * POST /api/import/upload-photo
 *
 * Single-photo upload endpoint that bypasses Next.js's ~10MB JSON-body
 * cap. Uses multipart/form-data so each photo flows through as a stream
 * blob instead of a base64 JSON string. Server stashes the bytes in R2
 * (or /tmp fallback) and returns a key the wizard then sends to
 * /api/import/extract.
 *
 * Why this exists: two iPhone photos base64-encoded as JSON exceed
 * Next.js's request.json() limit and parseBody fails with "Invalid JSON
 * body (Unterminated string ... at position 10485472)" — exactly 10MB.
 * Multipart sidesteps that path entirely.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { uploadPhoto } from '@/lib/photoStorage'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// HEIC/HEIF accepted here; server converts to JPEG via sharp before
// sending to Claude (sharp + libvips handles more variants than client
// libraries). VALID_MIMES on /api/import/extract still excludes HEIC
// since by the time bytes are sent there they should already be JPEG.
const VALID_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])
const MAX_BYTES = 25 * 1024 * 1024 // 25MB single-photo cap

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = getSession(request)
    if (!session) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }
    if (!session.is_admin) {
      const user = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
      if (!user?.is_patron) {
        return jsonResponse(
          { error: 'Friends of the Pod required to import pools', code: 'PATRON_REQUIRED' },
          403,
        )
      }
    }

    const form = await request.formData()
    const file = form.get('photo') as File | null
    if (!file || typeof file === 'string') {
      return jsonResponse({ error: 'Missing photo field', code: 'INVALID_REQUEST' }, 400)
    }
    if (!VALID_MIMES.has(file.type)) {
      return jsonResponse(
        { error: `Unsupported type "${file.type}"`, code: 'INVALID_TYPE' },
        400,
      )
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse(
        { error: `Photo exceeds ${MAX_BYTES} bytes`, code: 'PAYLOAD_TOO_LARGE' },
        413,
      )
    }

    let buffer = Buffer.from(await file.arrayBuffer())
    let storedType = file.type
    let storedExt = (file.type.split('/')[1] || 'bin').replace(/\W/g, '')

    // HEIC/HEIF — convert to JPEG immediately on upload, store the JPEG.
    // Two reasons: (1) browsers other than Safari can't display HEIC inline,
    // so the wizard's previewUrl rendered nothing for Chrome users; (2) the
    // server's section-bounds (returned by Claude after seeing the converted
    // JPEG) wouldn't line up with the original-HEIC dimensions if the
    // browser somehow rotated the HEIC differently from sharp's .rotate().
    // Storing the JPEG ensures client preview and server analysis see byte-
    // identical images. Try sharp first (libvips with libheif on macOS),
    // fall back to heic-convert (its own bundled decoder) for Linux/Railway.
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      let converted: Buffer | null = null
      try {
        const sharp = (await import('sharp')).default
        converted = await sharp(buffer).rotate().jpeg({ quality: 100 }).toBuffer()
      } catch {
        // sharp's libvips lacks HEVC decoder on Linux; fall through.
      }
      if (!converted) {
        const convert = (await import('heic-convert')).default
        const arrayBuffer = await convert({ buffer, format: 'JPEG', quality: 1 })
        converted = Buffer.from(arrayBuffer)
      }
      buffer = converted
      storedType = 'image/jpeg'
      storedExt = 'jpg'
    }

    const key = `import-uploads/${session.id}/${Date.now()}-${randomBytes(4).toString('hex')}.${storedExt}`
    await uploadPhoto(key, buffer, storedType)

    // For HEIC uploads, also return the converted JPEG bytes as a data URL
    // so the wizard's <img> previews work in any browser without needing a
    // second round-trip to fetch from R2/tmp.
    const previewDataUrl =
      file.type === 'image/heic' || file.type === 'image/heif'
        ? `data:${storedType};base64,${buffer.toString('base64')}`
        : null

    return jsonResponse({
      key,
      mediaType: storedType,
      sizeBytes: buffer.length,
      previewDataUrl,
    })
  } catch (error) {
    return handleApiError(error as Error)
  }
}
