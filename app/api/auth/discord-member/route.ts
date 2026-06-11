// GET /api/auth/discord-member - Check if current user is in the PtP Discord server
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { isGuildMember } from '@/lib/discord'
import { handleApiError } from '@/lib/utils'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = requireAuth(request)

    const user = await queryRow(
      'SELECT discord_id FROM users WHERE id = $1',
      [session.id]
    )

    if (!user?.discord_id) {
      return NextResponse.json({
        success: true,
        data: { isMember: false },
      })
    }

    const isMember = await isGuildMember(user.discord_id as string)

    return NextResponse.json({
      success: true,
      data: { isMember },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
