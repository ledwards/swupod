/**
 * The confirmation line after an admin grant (alpha panel). Same wording as
 * the legacy AdminGrantPanel's own copy, which stays inline in that file.
 */
export type GrantFlag = 'is_patron' | 'is_beta_tester' | 'is_alpha_tester'

export interface GrantedUser {
  username: string
  discord_id: string
}

export function grantSuccessMessage({
  user,
  preProvisioned,
  flag,
}: {
  user: GrantedUser
  preProvisioned: boolean
  flag: GrantFlag
}): string {
  if (flag === 'is_alpha_tester') {
    return `Granted alpha and beta access to ${user.username} (${user.discord_id}). ${
      preProvisioned ? 'Access is ready for their first sign-in.' : 'Refresh the session or sign in again to activate it.'
    }`
  }
  if (flag === 'is_patron') {
    return preProvisioned
      ? `Pre-provisioned new user with Discord ID ${user.discord_id} and granted patron access. They will see patron features on first sign-in.`
      : `Granted patron access to ${user.username} (${user.discord_id}).`
  }
  return preProvisioned
    ? `Pre-provisioned new user with Discord ID ${user.discord_id} and granted beta access. They will see beta features on first sign-in.`
    : `Granted beta access to ${user.username} (${user.discord_id}). Tell them to sign out and back in to see beta features immediately.`
}
