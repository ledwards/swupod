// GET /api/voice-packs/[id]/logo — the creator's pack logo bytes.
//
// Same access policy and caching as the clip route next door: unauthenticated (the
// logo appears on the /redeem confirmation and beside the host's pack picker, and it
// is branding the creator wants seen), active packs only, and a revalidating cache
// keyed on the pack's `updated_at` — the creator can replace their logo from their
// durable edit link, so a cached copy must not outlive the swap (see
// src/services/voicePackAssetCache.ts).
// The stored mime was decided by magic-byte sniffing at upload time, never by the
// uploader's Content-Type header, and SVG can never be stored — so this always
// serves a real raster image.
import { NextRequest } from 'next/server'
import { queryRow } from '@/lib/db'
import { errorResponse, handleApiError } from '@/lib/utils'
import {
  voicePackAssetCacheHeaders,
  voicePackAssetETag,
} from '@/src/services/voicePackAssetCache'

interface RouteContext {
  params: Promise<{ id: string }>
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse('Not found', 404)

    const row = await queryRow(
      `SELECT logo, logo_mime, updated_at FROM voice_packs WHERE id = $1 AND status = 'active'`,
      [id]
    )
    if (!row?.['logo']) return errorResponse('Not found', 404)

    const bytes = row['logo'] as Buffer
    const etag = voicePackAssetETag(`${id}-logo`, bytes.length, row['updated_at'])
    const headers = voicePackAssetCacheHeaders(etag)

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers })
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': (row['logo_mime'] as string) || 'application/octet-stream',
        'Content-Length': String(bytes.length),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
