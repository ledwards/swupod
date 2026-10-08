export function hasEntryAccess(
  user: { is_alpha_tester?: boolean; is_admin?: boolean; is_beta_tester?: boolean } | null | undefined
): boolean {
  return hasAlphaAccess(user)
}

export function hasAlphaAccess(user: {is_admin?:boolean;is_alpha_tester?:boolean}|null|undefined): boolean {
 return user?.is_admin===true || user?.is_alpha_tester===true
}
