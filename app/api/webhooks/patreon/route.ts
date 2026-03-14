import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { addPatronRole, removePatronRole } from '@/lib/discord'
import { query } from '@/lib/db'

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
  const discordId = extractDiscordId(body?.included)

  if (!discordId) {
    console.log('Patreon webhook: no Discord connection found, skipping', { event })
    return NextResponse.json({ ok: true, skipped: 'no_discord_connection' })
  }

  console.log('Patreon webhook:', { event, patronStatus, discordId })

  try {
    if (event === 'members:pledge:create' || event === 'members:create') {
      // members:create fires for brand new users (e.g. free trial signups)
      // members:pledge:create fires when existing followers upgrade to paid/trial
      if (patronStatus === 'active_patron') {
        await addPatronRole(discordId)
      }
    } else if (event === 'members:pledge:delete' || event === 'members:delete' ||
               ((event === 'members:pledge:update' || event === 'members:update') && patronStatus !== 'active_patron')) {
      await removePatronRole(discordId)
      await query(
        'UPDATE users SET is_beta_tester = FALSE WHERE discord_id = $1',
        [discordId]
      )
    } else if ((event === 'members:pledge:update' || event === 'members:update') && patronStatus === 'active_patron') {
      await addPatronRole(discordId)
    }
  } catch (err) {
    console.error('Patreon webhook: error processing event', err)
    // Still return 200 — Patreon retries on non-2xx
  }

  return NextResponse.json({ ok: true })
}
