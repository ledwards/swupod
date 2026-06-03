// @ts-nocheck
// GET /api/auth/patron-status - Check if current user is a Patreon patron
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { query, queryRow } from '@/lib/db'
import { isPatron } from '@/lib/discord'
import { handleApiError } from '@/lib/utils'

const DISCORD_INVITE_URL =
  process.env['NEXT_PUBLIC_DISCORD_INVITE_URL'] || 'https://discord.gg/u6fkdDzWqF'

function pendingMessageForReason(reason: string | null): string {
  if (reason === 'not_in_guild') {
    return `We received your Patreon subscription but you haven't joined the Pod Discord server yet. Join here: ${DISCORD_INVITE_URL}, then refresh this page.`
  }
  // Legacy rows have reason=NULL; treat as the "no Discord on Patreon" case.
  return "We received your Patreon subscription but couldn't find your Discord connection on Patreon. Go to patreon.com/settings/apps and link your Discord account, then try again."
}

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
      'SELECT discord_id, email, is_patron FROM users WHERE id = $1',
      [session.id]
    )

    // Fast path (Option B email-match): webhook already flipped users.is_patron
    // via LOWER(email) match. Skip the Discord round-trip.
    if (user?.is_patron === true) {
      // Self-heal: clear any stale patreon_pending row for this user since
      // they're now confirmed as a patron.
      if (user.email) {
        try { await query('DELETE FROM patreon_pending WHERE email = $1', [user.email]) } catch { /* ignore */ }
      }
      return NextResponse.json({
        success: true,
        data: { isPatron: true },
      })
    }

    // Fallback: Discord role check. Covers (a) legacy patrons whose webhook
    // fired before is_patron existed, and (b) email-mismatch — Patreon email
    // ≠ swupod email — where the Discord chain is the only signal we have.
    let patron = false
    if (user?.discord_id) {
      patron = await isPatron(user.discord_id as string)
      if (patron) {
        // Backfill the DB flag so the next call hits the fast path.
        try {
          await query('UPDATE users SET is_patron = TRUE WHERE id = $1', [session.id])
        } catch {
          // Non-fatal — Discord answer is authoritative; backfill is a perf opt.
        }
        // Self-heal: clear any stale patreon_pending row.
        if (user.email) {
          try { await query('DELETE FROM patreon_pending WHERE email = $1', [user.email]) } catch { /* ignore */ }
        }
      }
    }

    // If not a patron, surface a pending message if one exists.
    let pendingMessage: string | null = null
    if (!patron && user?.email) {
      try {
        const pending = await queryRow(
          'SELECT reason FROM patreon_pending WHERE email = $1',
          [user.email]
        )
        if (pending) {
          pendingMessage = pendingMessageForReason((pending.reason as string | null) || null)
        }
      } catch {
        // Table might not exist yet — ignore
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        isPatron: patron,
        ...(pendingMessage && {
          pendingPatreon: true,
          message: pendingMessage,
        }),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
