// GET /api/voice-packs/[id]/logo — the creator's pack logo bytes.
//
// Same access policy and caching as the clip route next door: unauthenticated (the
// logo appears on the /redeem confirmation and beside the host's pack picker, and it
// is branding the creator wants seen), active packs only, immutable one-year cache.
// The stored mime was decided by magic-byte sniffing at upload time, never by the
// uploader's Content-Type header, and SVG can never be stored — so this always
// serves a real raster image.
import { NextRequest } from 'next/server'
import { queryRow } from '@/lib/db'
import { errorResponse, handleApiError } from '@/lib/utils'

interface RouteContext {
  params: Promise<{ id: string }>
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse('Not found', 404)

    const row = await queryRow(
      `SELECT logo, logo_mime FROM voice_packs WHERE id = $1 AND status = 'active'`,
      [id]
    )
    if (!row?.['logo']) return errorResponse('Not found', 404)

    const bytes = row['logo'] as Buffer
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': (row['logo_mime'] as string) || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${id}-logo-${bytes.length}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
