// @ts-nocheck
// GET /api/pods/:shareId/chat/history - Fetch chat history from Discord thread
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { fetchThreadMessages } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    requireAuth(request)

    const pod = await queryRow(
      'SELECT id, discord_thread_id, is_public FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Pod not found', 404)
    }

    let messages: any[] = []
    if (pod.discord_thread_id) {
      const discordMessages = await fetchThreadMessages(pod.discord_thread_id)
      messages = discordMessages.filter(m => !m.isSystem)
    }

    // Build Discord thread URL if available
    let discordThreadUrl: string | null = null
    if (pod.discord_thread_id && process.env['DISCORD_GUILD_ID']) {
      discordThreadUrl = `discord://discord.com/channels/${process.env['DISCORD_GUILD_ID']}/${pod.discord_thread_id}`
    }

    return jsonResponse({ messages, isPublic: !!pod.is_public, discordThreadUrl })
  } catch (error) {
    return handleApiError(error)
  }
}
