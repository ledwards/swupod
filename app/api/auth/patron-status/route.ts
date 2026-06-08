// @ts-nocheck
// GET /api/auth/patron-status - Check if current user is a Patreon patron
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { query, queryRow } from '@/lib/db'
import { isPatron, addPatronRole, addBetaTesterRole } from '@/lib/discord'
import { findActivePatronByDiscordId } from '@/lib/patreon'
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
    //
    // Also flips is_beta_tester to TRUE — patron status implies beta access
    // ("no extra steps"); we do not require a separate /beta enrollment click.
    let patron = false
    if (user?.discord_id) {
      patron = await isPatron(user.discord_id as string)
      if (patron) {
        // Backfill the DB flag so the next call hits the fast path.
        try {
          await query(
            'UPDATE users SET is_patron = TRUE, is_beta_tester = TRUE WHERE id = $1',
            [session.id]
          )
        } catch {
          // Non-fatal — Discord answer is authoritative; backfill is a perf opt.
        }
        // Self-heal: clear any stale patreon_pending row.
        if (user.email) {
          try { await query('DELETE FROM patreon_pending WHERE email = $1', [user.email]) } catch { /* ignore */ }
        }
      }
    }

    // On-demand Patreon API lookup — closes the gap where a user subscribed
    // first and linked Discord on Patreon afterwards. Patreon fires NO
    // webhook for "Discord connection added," so without this lookup the
    // user has no recovery path until the Sunday sync-patrons-cron run.
    //
    // We hit this branch only when the Discord role check above returned
    // false. That covers two cases:
    //   1. Brand-new patron whose webhook fired without a Discord id (Patreon
    //      payloads omit social_connections by default) and our
    //      lookupDiscordIdByEmail fallback ALSO didn't find one because the
    //      user hadn't linked Discord on Patreon at webhook time.
    //   2. Same as #1 but with a Patreon-email ≠ swupod-email mismatch, so
    //      the webhook's email-match grant didn't fire either.
    //
    // If the Patreon API confirms this user IS an active patron via their
    // Discord id, we flip is_patron + is_beta_tester and proactively add
    // both Discord roles. The patreon-side lookup is cached for 5 min
    // (lib/patreon.getCachedActivePatrons), so the cost amortizes across
    // all stranded-patron checks in that window.
    if (!patron && user?.discord_id) {
      const match = await findActivePatronByDiscordId(user.discord_id as string)
      if (match) {
        patron = true
        try {
          await query(
            'UPDATE users SET is_patron = TRUE, is_beta_tester = TRUE WHERE id = $1',
            [session.id]
          )
        } catch {
          // Non-fatal — Patreon answer is authoritative; the flag will be
          // re-attempted on the next call.
        }
        // Self-heal: clear pending rows that match either side (the row
        // could have been written with Patreon email, swupod email, or NULL
        // discord_id; clean them all up so patron-status doesn't keep
        // surfacing a "fix your chain" message after we've resolved it).
        try {
          await query(
            `DELETE FROM patreon_pending
             WHERE ($1::text IS NOT NULL AND email = $1)
                OR ($2::text IS NOT NULL AND email = $2)
                OR ($3::text IS NOT NULL AND discord_id = $3)`,
            [user?.email || null, match.email || null, user?.discord_id || null]
          )
        } catch { /* ignore */ }
        // Best-effort: push the Discord roles forward so this user shows up
        // correctly in the Pod server immediately, not next cron run.
        // Both calls swallow their own errors; we don't care about ordering
        // and don't block the response on Discord API latency.
        void addPatronRole(user.discord_id as string).catch(() => {})
        void addBetaTesterRole(user.discord_id as string).catch(() => {})
      }
    }

    // If not a patron, check patreon_pending. A recent row is proof that
    // Patreon confirmed this user as a patron — sufficient evidence to
    // auto-enable without requiring the user to fix their Discord chain.
    // The cron sync keeps patreon_pending clean (stale rows for churned
    // patrons get deleted), so a surviving row is trustworthy within the
    // recency window. Falls through to the message path if the row is
    // older than the window (likely stale).
    //
    // Lookup is email OR discord_id — covers the email-mismatch case
    // (Patreon email ≠ swupod email) where email-only would miss a paying
    // patron who linked Discord on Patreon but isn't in our guild.
    let pendingMessage: string | null = null
    const PENDING_AUTO_ENABLE_DAYS = 180
    if (!patron && (user?.email || user?.discord_id)) {
      try {
        const pending = await queryRow(
          `SELECT email AS pending_email, reason, created_at FROM patreon_pending
           WHERE ($1::text IS NOT NULL AND email = $1)
              OR ($2::text IS NOT NULL AND discord_id = $2)
           ORDER BY created_at DESC LIMIT 1`,
          [user?.email || null, user?.discord_id || null]
        )
        if (pending) {
          const createdAt = pending.created_at as Date | string | null
          const ageMs = createdAt ? Date.now() - new Date(createdAt).getTime() : Infinity
          const withinWindow = ageMs <= PENDING_AUTO_ENABLE_DAYS * 24 * 60 * 60 * 1000
          if (withinWindow) {
            // Auto-enable: flip both flags (patron implies beta — "no extra
            // steps") and clear the pending row.
            try {
              await query(
                'UPDATE users SET is_patron = TRUE, is_beta_tester = TRUE WHERE id = $1',
                [session.id]
              )
              await query('DELETE FROM patreon_pending WHERE email = $1', [pending.pending_email])
              return NextResponse.json({
                success: true,
                data: { isPatron: true },
              })
            } catch {
              // DB write failed — fall through to message path so the user
              // at least sees instructions instead of a silent no-patron state.
            }
          }
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
