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

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = (file.type.split('/')[1] || 'bin').replace(/\W/g, '')
    const key = `import-uploads/${session.id}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
    await uploadPhoto(key, buffer, file.type)

    return jsonResponse({
      key,
      mediaType: file.type,
      sizeBytes: file.size,
    })
  } catch (error) {
    return handleApiError(error as Error)
  }
}
