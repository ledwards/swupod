// Shared helpers for the open-games API routes (Lobby V1, U1).
import { queryRow } from '@/lib/db'
import { handleApiError } from '@/lib/utils'
import { OpenGameError } from '@/src/services/openGames'

/** Clients speak pool share ids; the service speaks pool UUIDs. */
export async function resolvePoolId(poolShareId: string): Promise<string | null> {
  if (!poolShareId) return null
  const row = await queryRow('SELECT id FROM card_pools WHERE share_id = $1', [poolShareId])
  return row?.id ? String(row.id) : null
}

/** Map OpenGameError to its HTTP shape; defer everything else to handleApiError. */
export function openGameErrorResponse(error: unknown): Response {
  if (error instanceof OpenGameError) {
    // Same envelope as jsonResponse(null, status, message) + a machine code
    // so the client can branch (listing_gone toast vs format_mismatch, R28 copy).
    return Response.json(
      { success: false, data: null, message: error.message, code: error.code },
      { status: error.status }
    )
  }
  return handleApiError(error)
}
