// @ts-nocheck
// GET /api/chat/lobby/history?type=draft|sealed - Fetch lobby chat from Discord channel
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { fetchLobbyMessages } from '@/lib/discordLfg'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    requireAuth(request)

    const lobbyType = request.nextUrl.searchParams.get('type')
    if (lobbyType !== 'draft' && lobbyType !== 'sealed') {
      return errorResponse('Invalid lobby type. Must be "draft" or "sealed".', 400)
    }

    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10) || 50)) : 50

    const messages = await fetchLobbyMessages(lobbyType, limit)
    console.log(`[Lobby History] type=${lobbyType} limit=${limit} returned=${messages.length} messages`)

    return jsonResponse({ messages })
  } catch (error) {
    return handleApiError(error)
  }
}
