/**
 * Wayfinder Companion gating for Swiss Practice.
 *
 * Two states only:
 *   - no Companion        → tier 'none'  → manual reporting + install pitch
 *   - Companion detected  → tier 'ready' → live launch + auto-report
 *
 * We intentionally do NOT gate the live launch on an advertised capability or
 * version. Companions autoupdate, so version-gating only produced false "update
 * your plugin" friction for users already on a current build. Manual reporting
 * (Copy JSON / Copy Link) is always available regardless of tier.
 */
export type WayfinderPracticeTier = 'none' | 'ready'

/**
 * The Swiss Practice tier for the current Companion state — detection alone
 * enables the live launch.
 */
export function wayfinderPracticeTier(detected: boolean): WayfinderPracticeTier {
  return detected ? 'ready' : 'none'
}

/** Live launch + auto-report whenever the Companion is detected. */
export function isPracticeLiveReady(tier: WayfinderPracticeTier): boolean {
  return tier === 'ready'
}
