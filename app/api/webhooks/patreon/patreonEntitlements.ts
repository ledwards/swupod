export type PatreonEntitlementAction = 'grant' | 'revoke' | null
export type SiteEntitlementMatcher = 'email' | 'discordId'

const ACTIVE_PATREON_STATUSES = new Set(['active_patron', 'pay_upfront'])

const CREATE_EVENTS = new Set(['members:pledge:create', 'members:create'])
const UPDATE_EVENTS = new Set(['members:pledge:update', 'members:update'])
const DELETE_EVENTS = new Set(['members:pledge:delete', 'members:delete'])

export const DISCORD_ID_BY_EMAIL_SQL =
  'SELECT discord_id FROM users WHERE LOWER(email) = LOWER($1) AND discord_id IS NOT NULL LIMIT 1'

export function isActivePatreonMember(patronStatus: unknown): boolean {
  return typeof patronStatus === 'string' && ACTIVE_PATREON_STATUSES.has(patronStatus)
}

export function getPatreonEntitlementAction(
  event: string | null,
  patronStatus: unknown,
): PatreonEntitlementAction {
  if (!event) return null
  if (CREATE_EVENTS.has(event)) return 'grant'
  if (DELETE_EVENTS.has(event)) return 'revoke'
  if (!UPDATE_EVENTS.has(event)) return null
  return isActivePatreonMember(patronStatus) ? 'grant' : 'revoke'
}

export function siteEntitlementUpdateSql(
  action: Exclude<PatreonEntitlementAction, null>,
  matcher: SiteEntitlementMatcher,
): string {
  const predicate = matcher === 'email'
    ? 'LOWER(email) = LOWER($1)'
    : 'discord_id = $1'

  if (action === 'grant') {
    return `UPDATE users SET is_patron = TRUE, is_beta_tester = TRUE WHERE ${predicate}`
  }

  return `UPDATE users SET is_patron = FALSE, is_beta_tester = FALSE, auth_version = auth_version + 1 WHERE ${predicate}`
}

export function discordIdFromUserRow(row: Record<string, unknown> | null): string | null {
  return typeof row?.discord_id === 'string' && row.discord_id.length > 0
    ? row.discord_id
    : null
}
