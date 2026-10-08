// @ts-nocheck
// POST /api/chat/relay - Receive chat messages relayed from Leebo (Discord → Web App)
// Supports both pod thread messages (threadId) and lobby channel messages (channelId)
import { queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError, parseBody } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import type { Server as SocketIOServer } from 'socket.io'

declare global {
  var io: SocketIOServer | undefined
}

const RELAY_SECRET = process.env['CHAT_RELAY_SECRET']
const DRAFT_NOW_CHANNEL_ID = process.env['DISCORD_DRAFT_NOW_CHANNEL_ID']
const SEALED_NOW_CHANNEL_ID = process.env['DISCORD_SEALED_NOW_CHANNEL_ID']

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate the relay request
    if (!RELAY_SECRET) {
      return errorResponse('Relay not configured', 503)
    }

    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${RELAY_SECRET}`) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await parseBody(request)
    const { threadId, channelId, username, avatarUrl, text } = body

    if (!username || !text) {
      return errorResponse('Missing required fields: username, text', 400)
    }

    const io = global.io
    const message = {
      username,
      avatarUrl: avatarUrl || null,
      text,
      timestamp: new Date().toISOString(),
      isSystem: false,
      source: 'discord' as const,
    }

    // Lobby channel relay: channelId maps to draft or sealed lobby
    if (channelId) {
      let lobbyType: string | null = null
      if (channelId === DRAFT_NOW_CHANNEL_ID) lobbyType = 'draft'
      else if (channelId === SEALED_NOW_CHANNEL_ID) lobbyType = 'sealed'

      if (!lobbyType) {
        return errorResponse('Unknown channel ID', 404)
      }

      if (io) {
        io.to(`lobby-chat:${lobbyType}`).emit('lobby-chat:message', message)
      }

      return jsonResponse({ success: true })
    }

    // Pod thread relay: threadId maps to a specific pod
    if (threadId) {
      const pod = await queryRow(
        'SELECT id, share_id FROM pods WHERE discord_thread_id = $1',
        [threadId]
      )

      if (!pod) {
        return errorResponse('No pod found for this thread', 404)
      }

      if (io) {
        io.to(`chat:${pod.share_id}`).emit('chat:message', message)
      }

      return jsonResponse({ success: true })
    }

    return errorResponse('Missing threadId or channelId', 400)
  } catch (error) {
    return handleApiError(error)
  }
}
