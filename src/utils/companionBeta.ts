// The Wayfinder Companion plugin is gated behind the beta program. Beta users
// (beta testers + admins) see the full Companion experience — install pitches,
// capture-gated stats, the play-page integration. Everyone else sees the product
// as it was before the plugin existed: no Companion promotion anywhere, and the
// capture-gated /me surfaces show a neutral "Coming soon" instead of a pitch for
// something they're not meant to know about yet.
//
// Reuses the existing beta flag (is_beta_tester || is_admin) — same gate as
// early set access — so there's one beta program, not two.
export function isCompanionBeta(user: { is_beta_tester?: boolean | null; is_admin?: boolean | null } | null | undefined): boolean {
  return Boolean(user?.is_beta_tester || user?.is_admin)
}
