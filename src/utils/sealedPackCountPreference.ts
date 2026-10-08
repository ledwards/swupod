/**
 * Sealed pack-count preference — the player's last 6-vs-8 choice, remembered
 * across sessions.
 *
 * SPEC:
 * - Picking 6 or 8 packs makes that the default for the next sealed pool or
 *   sealed pod the player creates.
 * - Only 6 and 8 are ever stored or returned (see `normalizeSealedPackCount`);
 *   anything else falls back to the caller's default.
 * - Competitive Sealed still defaults to 8 when the player has never chosen —
 *   callers pass their own fallback.
 */

import {
  STANDARD_SEALED_PACKS_PER_PLAYER,
  normalizeSealedPackCount,
} from './sealedPodConfig'

/** Single site-wide key for the remembered sealed pack count. */
export const SEALED_PACK_COUNT_PREFERENCE_KEY = 'sealedPackCount'

/** Read the remembered pack count, or `fallback` if there is no valid saved choice. */
export function readSealedPackCountPreference(
  fallback: number = STANDARD_SEALED_PACKS_PER_PLAYER
): number {
  if (typeof window === 'undefined') return fallback
  try {
    return normalizeSealedPackCount(localStorage.getItem(SEALED_PACK_COUNT_PREFERENCE_KEY), fallback)
  } catch {
    return fallback
  }
}

/** Remember a pack count the player just picked. Invalid values are not stored. */
export function saveSealedPackCountPreference(packCount: number | string | null): number | null {
  const normalized = normalizeSealedPackCount(packCount, null as unknown as number)
  if (normalized === null || normalized === undefined) return null
  if (typeof window === 'undefined') return normalized
  try {
    localStorage.setItem(SEALED_PACK_COUNT_PREFERENCE_KEY, String(normalized))
  } catch (error) {
    console.warn('Failed to persist sealed pack count preference:', error)
  }
  return normalized
}
