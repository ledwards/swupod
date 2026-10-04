interface AnalyticsClient {
  get_property(key: string): unknown
  reset(): void
  identify(id: string, properties: Record<string, unknown>): void
  register(properties: Record<string, unknown>): void
}
interface AnalyticsUser {
  id: string
  discord_id?: string
  discord_username?: string
  username?: string
  is_admin?: boolean
  is_beta_tester?: boolean
}
/** Preserve anonymous browser identity across reloads; reset only a completed logout. */
export function syncAnalyticsIdentity(client: AnalyticsClient, user: AnalyticsUser | null, loading: boolean): void {
  if (loading) return
  if (user) {
    client.identify(user.discord_id ? `discord-${user.discord_id}` : user.id, {
      discord_username: user.discord_username ?? user.username,
      is_admin: user.is_admin,
      is_beta_tester: user.is_beta_tester,
    })
  } else if (client.get_property('$user_id')) {
    client.reset()
  }
  // reset clears superproperties, so restore the surface on logout too.
  client.register({ surface: 'swupod', environment: 'production' })
}
