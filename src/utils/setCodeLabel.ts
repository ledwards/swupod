/**
 * Turns a stored `card_pools.set_code` value into set codes fit for display.
 *
 * Multi-pack formats (chaos sealed, chaos draft) store set_code as a comma-joined list of
 * every pack's code — "SOR,SHD,SOR,LAW" for a pool with two SOR packs. Display surfaces
 * want the distinct sets, not the pack-by-pack roll call.
 *
 * SPEC:
 *   1. De-dupe. A pool of six SOR packs is a "SOR" pool, not "SOR,SOR,SOR,SOR,SOR,SOR".
 *   2. Event Packs display as PROMO. Their internal codes (GC2026_SILVER/GC2026_BLACK) are
 *      entitlement keys, not set codes, and mean nothing to a reader.
 *   3. First-seen order is preserved; callers that want set order sort afterwards.
 */

import { PROMO_SET_CODES } from '../services/chaosSealedSelection'

/** What Event Packs are called on any surface that shows a set code. */
export const PROMO_SET_DISPLAY = 'PROMO'

/**
 * Split a raw set_code column value (or an array) into distinct display codes.
 * Returns [] for empty/nullish input.
 */
export function normalizeSetCodes(raw: string | readonly string[] | null | undefined): string[] {
  if (!raw) return []
  const parts = Array.isArray(raw) ? raw : String(raw).split(',')
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const code = String(part).trim().toUpperCase()
    if (!code) continue
    const display = code in PROMO_SET_CODES ? PROMO_SET_DISPLAY : code
    if (seen.has(display)) continue
    seen.add(display)
    out.push(display)
  }
  return out
}

/** The same, joined for display: "SOR, LAW" / "PROMO" / "" when there's nothing to show. */
export function formatSetCodeLabel(raw: string | readonly string[] | null | undefined): string {
  return normalizeSetCodes(raw).join(', ')
}
