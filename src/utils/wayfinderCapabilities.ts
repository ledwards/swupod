/**
 * Wayfinder Companion capability gating for Swiss Practice.
 *
 * The Companion announces a capability list (see useWayfinderDetection). Older
 * published builds advertise NO capabilities; only builds that support the live
 * Swiss Practice flow (claim → `wayfinder:practice-create-game` → result
 * forwarding) advertise `ptp-practice-live`.
 *
 * This lets the play page degrade gracefully and roll forward automatically:
 *   - no Companion           → tier 'none'        → manual reporting + install pitch
 *   - old Companion          → tier 'needs-update'→ manual reporting + "update" nudge
 *   - capable Companion      → tier 'ready'       → live launch + auto-report
 *
 * Manual reporting is always available regardless of tier; the plugin is never
 * required. As users install/update to a capable build the tier flips to 'ready'
 * on its own — no PTP deploy, no flag day.
 *
 * CROSS-REPO CONTRACT: the Wayfinder extension must include this capability in
 * the marker it injects (`<meta name="wayfinder-installed" data-capabilities=…>`,
 * comma-separated) and/or its `wayfinder:metadata` postMessage (`{ capabilities:
 * [...] }`). Until it does, every install is treated as 'needs-update' (graceful).
 */
export const PRACTICE_LIVE_CAPABILITY = 'ptp-practice-live'

export type WayfinderPracticeTier = 'none' | 'needs-update' | 'ready'

/**
 * Normalize a raw capability signal into a string[]. Accepts an array (from the
 * postMessage payload) or a comma-separated string (from the meta dataset);
 * anything else → [].
 */
export function parseCapabilities(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((c): c is string => typeof c === 'string' && c.length > 0)
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0)
  }
  return []
}

/**
 * The Swiss Practice tier for the current Companion state. `detected` is whether
 * the extension is present at all; `capabilities` is whatever it advertised.
 */
export function wayfinderPracticeTier(
  detected: boolean,
  capabilities: string[] | null | undefined
): WayfinderPracticeTier {
  if (!detected) return 'none'
  return (capabilities || []).includes(PRACTICE_LIVE_CAPABILITY) ? 'ready' : 'needs-update'
}

/** Live launch + auto-report only when a capable Companion is present. */
export function isPracticeLiveReady(tier: WayfinderPracticeTier): boolean {
  return tier === 'ready'
}

/**
 * Show the "update your Companion" nudge: the user has the extension but it can't
 * do the live flow yet. Gated on `settled` so we don't flash it before detection
 * resolves. Not gated on beta access — they already opted into the plugin.
 */
export function shouldShowUpdateNudge(tier: WayfinderPracticeTier, settled: boolean): boolean {
  return tier === 'needs-update' && settled
}
