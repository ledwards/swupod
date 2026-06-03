import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { addPatronRole, removePatronRole, isGuildMember } from '@/lib/discord'
import { query } from '@/lib/db'
import { lookupDiscordIdByEmail } from '@/lib/patreon'

const WEBHOOK_SECRET = process.env['PATREON_WEBHOOK_SECRET']

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) {
    return false
  }
  const digest = crypto.createHmac('md5', WEBHOOK_SECRET).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

function extractDiscordId(included: any[]): string | null {
  if (!Array.isArray(included)) return null

  for (const resource of included) {
    const discordConnection = resource?.attributes?.social_connections?.discord
    if (discordConnection?.user_id) {
      return discordConnection.user_id
    }
  }
  return null
}

function extractPatreonEmail(body: any): string | null {
  return body?.data?.attributes?.email || null
}

function extractPatreonName(body: any): string | null {
  return body?.data?.attributes?.full_name || null
}

/**
 * When addPatronRole fails for a patron whose Discord ID we DO have,
 * the most common cause is "user not in the guild." Confirm by hitting
 * isGuildMember and, if so, record a 'not_in_guild' pending row so the
 * /api/auth/patron-status endpoint can surface the right message —
 * "join the Pod Discord server" — instead of the (wrong) "link Discord
 * on Patreon" message. Pending rows are cleared on the next successful
 * role assignment (cron auto-heal, next webhook event, or admin sync).
 */
async function recordPendingIfNotInGuild(
  discordId: string,
  patreonEmail: string | null,
  patreonName: string | null,
  event: string | null,
  patronStatus: string | null,
): Promise<void> {
  if (!patreonEmail) return
  try {
    const inServer = await isGuildMember(discordId)
    if (inServer) return // some other failure cause; don't pitch the wrong fix
    await query(
      `INSERT INTO patreon_pending (email, patreon_name, event, patron_status, reason, created_at)
       VALUES ($1, $2, $3, $4, 'not_in_guild', NOW())
       ON CONFLICT (email) DO UPDATE SET
         patreon_name = EXCLUDED.patreon_name,
         event = EXCLUDED.event,
         patron_status = EXCLUDED.patron_status,
         reason = 'not_in_guild',
         created_at = NOW()`,
      [patreonEmail, patreonName, event, patronStatus]
    )
    console.log('Patreon webhook: recorded not_in_guild pending', { patreonEmail, discordId })
  } catch (err) {
    console.warn('Patreon webhook: could not record not_in_guild pending', { error: err })
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-patreon-signature')
  const event = request.headers.get('x-patreon-event')

  if (!verifySignature(rawBody, signature)) {
    console.error('Patreon webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.error('Patreon webhook: invalid JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patronStatus = body?.data?.attributes?.patron_status
  let discordId = extractDiscordId(body?.included)
  const patreonEmail = extractPatreonEmail(body)
  const patreonName = extractPatreonName(body)

  // Patreon webhooks don't include social_connections by default.
  // If Discord ID isn't in the payload, look it up via the Patreon API.
  if (!discordId && patreonEmail) {
    console.log('Patreon webhook: no Discord in payload, trying API lookup', { patreonEmail, patreonName, event })
    discordId = await lookupDiscordIdByEmail(patreonEmail)
    if (discordId) {
      console.log('Patreon webhook: found Discord ID via API lookup', { discordId, patreonEmail })
    }
  }

  // Treat free trial users the same as active patrons.
  const isActiveMember = patronStatus === 'active_patron' || patronStatus === 'pay_upfront'

  // Option B: email-match patron flag. Runs independently of Discord so a
  // patron whose Patreon email matches their swupod email gets recognized
  // even without Discord linking or guild membership. Discord role
  // assignment below is still attempted in parallel for community
  // recognition + as a fallback path in patron-status when emails mismatch.
  const grantsPatron =
    event === 'members:pledge:create' ||
    event === 'members:create' ||
    ((event === 'members:pledge:update' || event === 'members:update') && isActiveMember)
  const revokesPatron =
    event === 'members:pledge:delete' ||
    event === 'members:delete' ||
    ((event === 'members:pledge:update' || event === 'members:update') && !isActiveMember)

  if (patreonEmail && (grantsPatron || revokesPatron)) {
    try {
      if (grantsPatron) {
        const res = await query(
          'UPDATE users SET is_patron = TRUE WHERE LOWER(email) = LOWER($1)',
          [patreonEmail]
        )
        console.log('Patreon webhook: is_patron email-match grant', { patreonEmail, event, rowCount: (res as any)?.rowCount })
      } else {
        const res = await query(
          'UPDATE users SET is_patron = FALSE, is_beta_tester = FALSE WHERE LOWER(email) = LOWER($1)',
          [patreonEmail]
        )
        console.log('Patreon webhook: is_patron email-match revoke', { patreonEmail, event, rowCount: (res as any)?.rowCount })
      }
    } catch (err) {
      console.error('Patreon webhook: is_patron email-match update failed', { patreonEmail, event, error: err })
    }
  }

  if (!discordId) {
    console.warn('Patreon webhook: no Discord connection found (payload + API lookup failed)', {
      event,
      patronStatus,
      patreonEmail,
      patreonName,
    })

    // Record the failed attempt so patron-status endpoint can warn the user
    // to link their Discord on Patreon
    if (patreonEmail && (event === 'members:pledge:create' || event === 'members:create')) {
      try {
        await query(
          `INSERT INTO patreon_pending (email, patreon_name, event, patron_status, reason, created_at)
           VALUES ($1, $2, $3, $4, 'no_discord_linked', NOW())
           ON CONFLICT (email) DO UPDATE SET
             patreon_name = EXCLUDED.patreon_name,
             event = EXCLUDED.event,
             patron_status = EXCLUDED.patron_status,
             reason = 'no_discord_linked',
             created_at = NOW()`,
          [patreonEmail, patreonName, event, patronStatus]
        )
        console.log('Patreon webhook: recorded pending patron (no Discord link)', { patreonEmail, patreonName })
      } catch (dbErr) {
        // Table might not exist yet — that's OK, just log
        console.warn('Patreon webhook: could not record pending patron (table may not exist)', { error: dbErr })
      }
    }

    return NextResponse.json({ ok: true, skipped: 'no_discord_connection' })
  }

  console.log('Patreon webhook received:', { event, patronStatus, discordId, patreonEmail, patreonName })

  try {
    if (event === 'members:pledge:create' || event === 'members:create') {
      // members:create fires for brand new users (including free trial signups)
      // members:pledge:create fires when existing followers upgrade to paid/trial
      // Always add role on create — free trial users should get immediate access
      const success = await addPatronRole(discordId)
      console.log('Patreon webhook: addPatronRole result', { discordId, success, event, patronStatus })
      if (success && patreonEmail) {
        try { await query('DELETE FROM patreon_pending WHERE email = $1', [patreonEmail]) } catch { /* ignore */ }
      } else if (!success) {
        await recordPendingIfNotInGuild(discordId, patreonEmail, patreonName, event, patronStatus)
      }
    } else if (event === 'members:pledge:delete' || event === 'members:delete' ||
               ((event === 'members:pledge:update' || event === 'members:update') && !isActiveMember)) {
      const success = await removePatronRole(discordId)
      console.log('Patreon webhook: removePatronRole result', { discordId, success, event })
      await query(
        'UPDATE users SET is_beta_tester = FALSE WHERE discord_id = $1',
        [discordId]
      )
    } else if ((event === 'members:pledge:update' || event === 'members:update') && isActiveMember) {
      const success = await addPatronRole(discordId)
      console.log('Patreon webhook: addPatronRole result (update)', { discordId, success, event })
      if (success && patreonEmail) {
        try { await query('DELETE FROM patreon_pending WHERE email = $1', [patreonEmail]) } catch { /* ignore */ }
      } else if (!success) {
        await recordPendingIfNotInGuild(discordId, patreonEmail, patreonName, event, patronStatus)
      }
    } else {
      console.log('Patreon webhook: unhandled event/status combo', { event, patronStatus, discordId })
    }
  } catch (err) {
    console.error('Patreon webhook: error processing event', { event, patronStatus, discordId, error: err })
    // Still return 200 — Patreon retries on non-2xx
  }

  return NextResponse.json({ ok: true })
}
