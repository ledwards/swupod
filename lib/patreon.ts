// Patreon API client for fetching patron data
// Requires: PATREON_CREATOR_ACCESS_TOKEN, PATREON_CAMPAIGN_ID

const ACCESS_TOKEN = process.env['PATREON_CREATOR_ACCESS_TOKEN']
const CAMPAIGN_ID = process.env['PATREON_CAMPAIGN_ID']

const PATREON_API_BASE = 'https://www.patreon.com/api/oauth2/v2'

export interface PatreonMember {
  patreonUserId: string
  fullName: string | null
  email: string | null
  patronStatus: string | null
  discordUserId: string | null
  /**
   * Currently-entitled pledge amount in cents. Null when Patreon doesn't return
   * a value (free trial mid-flow, etc.). Source of truth for the per-patron
   * snapshot used by the grandfathering audit trail.
   */
  pledgeAmountCents: number | null
  /**
   * ISO 8601 timestamp of when this patron's pledge relationship started.
   * Used to identify pre-raise (legacy) supporters for dispute resolution.
   */
  pledgeStartedAt: string | null
}

/**
 * Fetch all active patrons from the Patreon API, including their Discord connections.
 * Paginates through all members automatically.
 */
export async function fetchAllPatrons(): Promise<PatreonMember[]> {
  if (!ACCESS_TOKEN || !CAMPAIGN_ID) {
    throw new Error('Missing PATREON_CREATOR_ACCESS_TOKEN or PATREON_CAMPAIGN_ID env vars')
  }

  const members: PatreonMember[] = []
  let cursor: string | null = null

  do {
    const url = new URL(`${PATREON_API_BASE}/campaigns/${CAMPAIGN_ID}/members`)
    url.searchParams.set('include', 'user')
    url.searchParams.set(
      'fields[member]',
      'full_name,email,patron_status,currently_entitled_amount_cents,pledge_relationship_start',
    )
    url.searchParams.set('fields[user]', 'social_connections')
    url.searchParams.set('page[count]', '100')
    if (cursor) {
      url.searchParams.set('page[cursor]', cursor)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Patreon API error ${response.status}: ${body}`)
    }

    const data = await response.json()

    // Build a map of user IDs to their social connections
    const userSocials = new Map<string, string | null>()
    if (Array.isArray(data.included)) {
      for (const resource of data.included) {
        if (resource.type === 'user') {
          const discordId = resource.attributes?.social_connections?.discord?.user_id || null
          userSocials.set(resource.id, discordId)
        }
      }
    }

    // Process members
    if (Array.isArray(data.data)) {
      for (const member of data.data) {
        const userId = member.relationships?.user?.data?.id
        const rawPledgeCents = member.attributes?.currently_entitled_amount_cents
        const pledgeAmountCents =
          typeof rawPledgeCents === 'number' && Number.isFinite(rawPledgeCents) ? rawPledgeCents : null
        const rawPledgeStart = member.attributes?.pledge_relationship_start
        const pledgeStartedAt = typeof rawPledgeStart === 'string' && rawPledgeStart.length > 0 ? rawPledgeStart : null
        members.push({
          patreonUserId: userId || member.id,
          fullName: member.attributes?.full_name || null,
          email: member.attributes?.email || null,
          patronStatus: member.attributes?.patron_status || null,
          discordUserId: userId ? (userSocials.get(userId) || null) : null,
          pledgeAmountCents,
          pledgeStartedAt,
        })
      }
    }

    cursor = data.meta?.pagination?.cursors?.next || null
  } while (cursor)

  return members
}

/**
 * Fetch active patrons with linked Discord accounts.
 * Includes both active_patron and pay_upfront (free trial) statuses.
 */
export async function fetchActivePatronsWithDiscord(): Promise<PatreonMember[]> {
  const allMembers = await fetchAllPatrons()
  const activeStatuses = ['active_patron', 'pay_upfront']
  return allMembers.filter(m => activeStatuses.includes(m.patronStatus || '') && m.discordUserId)
}

/**
 * Look up a single member's Discord ID via the Patreon API.
 * Used as a fallback when webhook payloads don't include social_connections.
 * Searches by email since that's what we have from the webhook.
 * Returns the Discord user ID or null.
 */
export async function lookupDiscordIdByEmail(email: string): Promise<string | null> {
  if (!ACCESS_TOKEN || !CAMPAIGN_ID) {
    console.warn('lookupDiscordIdByEmail: missing PATREON_CREATOR_ACCESS_TOKEN or PATREON_CAMPAIGN_ID')
    return null
  }

  try {
    // Fetch all members and find by email — Patreon API doesn't support email filter
    // This is fine for webhook-triggered lookups (infrequent)
    const allMembers = await fetchAllPatrons()
    const match = allMembers.find(m => m.email?.toLowerCase() === email.toLowerCase())
    return match?.discordUserId || null
  } catch (err) {
    console.error('lookupDiscordIdByEmail: failed', { email, error: err })
    return null
  }
}

// --- Active-patron cache --------------------------------------------------
//
// Why: the on-demand patron-status check (app/api/auth/patron-status) needs
// to ask "is this Discord ID currently an active patron on Patreon?" on
// every cache-cold call. Without a cache, every non-patron page load would
// trigger a full paginated /members fetch. The 5-sec TTL is short enough
// that a freshly-subscribed patron sees their access quickly (the
// webhook handles the same-email synchronous case; this is the fallback
// for the email-mismatch + Discord-linked-after-subscribe slice), and long
// enough that we don't hammer Patreon during a traffic spike.
//
// Singleflight (inflightFetch) prevents N concurrent cache-cold requests
// from each triggering their own paginated fetch.

const ACTIVE_PATRON_CACHE_TTL_MS = 5 * 1000
const ACTIVE_PATRON_STATUSES = new Set(['active_patron', 'pay_upfront'])

let cachedActivePatrons: { data: PatreonMember[]; expiresAt: number } | null = null
let inflightActivePatronFetch: Promise<PatreonMember[]> | null = null

/**
 * Returns the list of active patrons (active_patron + pay_upfront), cached
 * in process for ACTIVE_PATRON_CACHE_TTL_MS. Concurrent cache-cold calls
 * share a single in-flight fetch. Failures are NOT cached — the next call
 * retries.
 */
export async function getCachedActivePatrons(): Promise<PatreonMember[]> {
  if (cachedActivePatrons && cachedActivePatrons.expiresAt > Date.now()) {
    return cachedActivePatrons.data
  }
  if (inflightActivePatronFetch) return inflightActivePatronFetch

  inflightActivePatronFetch = (async () => {
    try {
      const all = await fetchAllPatrons()
      const active = all.filter((m) => ACTIVE_PATRON_STATUSES.has(m.patronStatus || ''))
      cachedActivePatrons = { data: active, expiresAt: Date.now() + ACTIVE_PATRON_CACHE_TTL_MS }
      return active
    } finally {
      inflightActivePatronFetch = null
    }
  })()

  return inflightActivePatronFetch
}

/**
 * On-demand lookup: is `discordId` currently an active patron on Patreon?
 * Backs the patron-status real-time check that closes the
 * "user-linked-Discord-after-subscribe" gap (Patreon fires no webhook for
 * that event, so without this lookup the user waits up to a week for the
 * Sunday cron to discover them).
 *
 * Returns the matching member, or null on miss / API failure. Failures
 * degrade silently so the caller falls through to the existing
 * patreon_pending message path instead of throwing.
 */
export async function findActivePatronByDiscordId(
  discordId: string,
): Promise<PatreonMember | null> {
  if (!discordId) return null
  try {
    const patrons = await getCachedActivePatrons()
    return patrons.find((p) => p.discordUserId === discordId) || null
  } catch (err) {
    console.warn('findActivePatronByDiscordId: failed', { discordId, error: String(err) })
    return null
  }
}

/**
 * Test-only: clear the cache so a unit test can assert on cache miss behavior.
 * Not part of the public API contract.
 */
export function __resetActivePatronCacheForTests(): void {
  cachedActivePatrons = null
  inflightActivePatronFetch = null
}
