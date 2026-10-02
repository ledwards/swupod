export function hasEntryAccess(
  user: { is_admin?: boolean; is_beta_tester?: boolean } | null | undefined
): boolean {
  return user?.is_admin === true || user?.is_beta_tester === true
}
