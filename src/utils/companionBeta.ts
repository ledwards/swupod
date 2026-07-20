// Who sees the Wayfinder Companion PROMOTION (install pitches, the play-page
// install/autojoin column, capture-gated /me surfaces).
//
// GA (Lobby V1, 2026-07): the rollout gate is removed — everyone sees the
// Companion promotion. The function (and its call sites) stay so a future
// rollout of a new gated capability re-introduces a check in exactly one
// place, and PluginCTA's `?plugincta=soon|hide` QA overrides keep working.
//
// NOTE: this gates PROMOTION only. Anyone who already HAS the plugin installed
// (wayfinderDetected) gets the full functional behavior regardless.
export function isCompanionBeta(_user: { is_beta_tester?: boolean | null; is_admin?: boolean | null } | null | undefined): boolean {
  return true
}
