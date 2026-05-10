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
    // browser auto-rotated the HEIC differently from how the server did.
    // Storing the JPEG ensures client preview and server analysis see byte-
    // identical images.
    //
    // Use heic-convert at quality 0.85 specifically. A/B test against
    // sq-lee-law ground truth (scripts/test-heic-paths.ts) showed
    // heic-convert@0.85 produces the BEST extraction (8 pool errors / 17
    // deck errors / 2 phantoms vs sharp@100's 9/22/7). Counter-intuitive
    // but consistent: the lossy compression acts as a noise floor that
    // suppresses Claude's over-reading of faint pencil tally marks. Higher
    // quality = more confident reads = more phantoms.
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      const convert = (await import('heic-convert')).default
      const arrayBuffer = await convert({ buffer, format: 'JPEG', quality: 0.85 })
      buffer = Buffer.from(arrayBuffer)
      storedType = 'image/jpeg'
      storedExt = 'jpg'
    }

    // Bake-in any EXIF orientation and strip the EXIF tag before storing.
    // Why: heic-convert outputs JPEG with the source's pixel buffer + may
    // preserve an orientation tag. iPhone JPEGs straight from camera also
    // carry orientation. If the stored file has an orientation tag,
    // browsers will auto-rotate when rendering it but server-side OMR may
    // see it pre- or post-rotation depending on whose code applies the
    // rotation. That mismatch produces section bounds in one coordinate
    // space and a rendered <img> in another → the cropped section image
    // points at the wrong region of the photo.
    //
    // sharp.rotate() with no arg applies EXIF orientation. .withMetadata({})
    // (or default) DROPS the EXIF block on output, so the resulting bytes
    // have no rotation hint at all. After this, both client preview and
    // server OMR see the same canonical pixel orientation.
    try {
      const sharp = (await import('sharp')).default
      buffer = await sharp(buffer).rotate().jpeg({ quality: 95, mozjpeg: false }).toBuffer()
      // After sharp.jpeg(), the buffer is always JPEG regardless of input.
      storedType = 'image/jpeg'
      storedExt = 'jpg'
    } catch (err) {
      console.warn('[upload-photo] sharp rotate failed, storing un-canonicalized:', err)
    }

    // Read final-pixel dimensions and generate a small preview for the browser.
    // dimWidth/Height: CroppedView relies on these for crop math — without them
    // the section image renders against the wrong coordinate space. Chrome
    // reports 0×0 for HEIC <img>, so we read from the server-side buffer.
    let dimWidth: number | null = null
    let dimHeight: number | null = null
    // For HEIC uploads, generate a small downscaled preview for the browser UI.
    // The full-quality bytes are stored to R2/tmp below — returning the full
    // buffer as base64 (~20MB per image) in the JSON response caused OOM on
    // concurrent large HEIC uploads and took the server down. A 1200px/q70
    // thumbnail is ~150-300KB — 100× smaller and plenty for the wizard preview.
    let previewDataUrl: string | null = null
    try {
      const sharp = (await import('sharp')).default
      const meta = await sharp(buffer).metadata()
      dimWidth = meta.width || null
      dimHeight = meta.height || null
      if (file.type === 'image/heic' || file.type === 'image/heif') {
        const previewBuffer = await sharp(buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer()
        previewDataUrl = `data:image/jpeg;base64,${previewBuffer.toString('base64')}`
      }
    } catch (err) {
      console.warn('[upload-photo] metadata/preview generation failed:', err)
      // Best-effort — client falls back to its own measurement if missing.
    }

    const key = `import-uploads/${session.id}/${Date.now()}-${randomBytes(4).toString('hex')}.${storedExt}`
    await uploadPhoto(key, buffer, storedType)

    return jsonResponse({
      key,
      mediaType: storedType,
      sizeBytes: buffer.length,
      previewDataUrl,
      width: dimWidth,
      height: dimHeight,
    })
  } catch (error) {
    return handleApiError(error as Error)
  }
}
