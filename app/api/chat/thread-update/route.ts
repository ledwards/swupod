// @ts-nocheck
// POST /api/chat/thread-update - Receive thread updates relayed from Leebo (Discord → Web App)
// Supports thread name changes which update the pod name in the database.
import { query, queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError, parseBody } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import type { Server as SocketIOServer } from 'socket.io'

declare global {
  var io: SocketIOServer | undefined
}

const RELAY_SECRET = process.env['CHAT_RELAY_SECRET']

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!RELAY_SECRET) {
      return errorResponse('Relay not configured', 503)
    }

    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${RELAY_SECRET}`) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await parseBody(request)
    const { threadId, name } = body

    if (!threadId) {
      return errorResponse('Missing required field: threadId', 400)
    }

    const pod = await queryRow(
      'SELECT id, share_id, pod_type, name FROM pods WHERE discord_thread_id = $1',
      [threadId]
    )

    if (!pod) {
      return errorResponse('No pod found for this thread', 404)
    }

    // Update pod name if provided
    if (typeof name === 'string' && name.trim().length > 0) {
      const trimmedName = name.trim().slice(0, 100)

      // Skip if name already matches (prevents redundant update when
      // web app renamed → Discord updated → Leebo relayed back)
      if (pod.name === trimmedName) {
        return jsonResponse({ success: true })
      }

      await query(
        'UPDATE pods SET name = $1, state_version = state_version + 1 WHERE id = $2',
        [trimmedName, pod.id]
      )

      // Broadcast state update to connected clients
      const io = global.io
      if (io) {
        if (pod.pod_type === 'sealed') {
          const { broadcastSealedPodState } = await import('@/src/lib/socketBroadcast')
          broadcastSealedPodState(pod.share_id).catch(() => {})
        } else {
          const { broadcastDraftState } = await import('@/src/lib/socketBroadcast')
          broadcastDraftState(pod.share_id).catch(() => {})
        }

        const { broadcastPublicPodsUpdate } = await import('@/src/lib/socketBroadcast')
        broadcastPublicPodsUpdate().catch(() => {})
      }
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
