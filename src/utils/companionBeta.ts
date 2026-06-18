// Who sees the Wayfinder Companion PROMOTION (install pitches, the play-page
// install/autojoin column, capture-gated /me surfaces). Everyone else sees the
// product as it was before the plugin: no promotion, and a neutral "Coming soon"
// where capture-gated stats would be.
//
// ROLLOUT: admin-only for now (testing) → flip to beta (is_beta_tester) → then
// remove the gate entirely. To beta-gate later, add `|| user?.is_beta_tester`.
//
// NOTE: this gates PROMOTION only. Anyone who already HAS the plugin installed
// (wayfinderDetected) gets the full functional behavior — lobby prompts, autojoin,
// their captured stats — regardless of this flag. Gate detection-aware surfaces
// on `isCompanionBeta(user) || wayfinderDetected`, not this flag alone.
export function isCompanionBeta(user: { is_beta_tester?: boolean | null; is_admin?: boolean | null } | null | undefined): boolean {
  return Boolean(user?.is_admin)
}
