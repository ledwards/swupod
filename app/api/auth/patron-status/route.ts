// @ts-nocheck
// GET /api/auth/patron-status - Check if current user is a Patreon patron
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { isPatron } from '@/lib/discord'
import { handleApiError } from '@/lib/utils'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)

    // Admins are always patrons
    if (session.is_admin) {
      return NextResponse.json({
        success: true,
        data: { isPatron: true },
      })
    }

    const user = await queryRow(
      'SELECT discord_id, email FROM users WHERE id = $1',
      [session.id]
    )

    if (!user?.discord_id) {
      return NextResponse.json({
        success: true,
        data: { isPatron: false },
      })
    }

    const patron = await isPatron(user.discord_id as string)

    // If not a patron, check if they have a pending Patreon sub without Discord linked
    let pendingPatreon = false
    if (!patron && user.email) {
      try {
        const pending = await queryRow(
          'SELECT 1 FROM patreon_pending WHERE email = $1',
          [user.email]
        )
        pendingPatreon = !!pending
      } catch {
        // Table might not exist yet — ignore
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        isPatron: patron,
        ...(pendingPatreon && {
          pendingPatreon: true,
          message: 'We received your Patreon subscription but couldn\'t find your Discord connection on Patreon. Go to patreon.com/settings/apps and link your Discord account, then try again.',
        }),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
