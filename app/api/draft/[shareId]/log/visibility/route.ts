// @ts-nocheck
/**
 * PATCH /api/draft/:shareId/log/visibility - Toggle draft log visibility
 *
 * Body: { draftPublic?: boolean, playerPublic?: boolean }
 * - draftPublic: Host can toggle pod-level is_log_public
 * - playerPublic: Any participant can toggle their own is_log_public
 *
 * Requires authentication.
 */
import { query, queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)

    if (!session) {
      return errorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { draftPublic, playerPublic } = body

    // Load draft pod
    const pod = await queryRow(
      `SELECT id, host_id FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    const isHost = session.id === pod.host_id

    // Host can toggle pod-level visibility
    if (draftPublic !== undefined) {
      if (!isHost) {
        return errorResponse('Only the host can change draft-level visibility', 403)
      }
      await query(
        `UPDATE pods SET is_log_public = $1 WHERE id = $2`,
        [!!draftPublic, pod.id]
      )
    }

    // Any participant can toggle their own visibility
    if (playerPublic !== undefined) {
      const result = await query(
        `UPDATE pod_players SET is_log_public = $1
         WHERE pod_id = $2 AND user_id = $3`,
        [!!playerPublic, pod.id, session.id]
      )
      if (result.rowCount === 0) {
        return errorResponse('You are not a participant in this draft', 403)
      }
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
