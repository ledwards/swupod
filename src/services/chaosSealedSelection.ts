/**
 * Chaos Sealed selection rules — pure, shared by the page (to gate the Create button)
 * and the API route (to reject a spoofed request).
 *
 * SPEC: a sealed pool must be buildable. Every regular booster carries a Leader slot, but
 * GC Event Packs are promo-card packs — their entire catalog is Units (no Leaders, no
 * Bases). A pool made only of Event Packs therefore has nothing to build a deck around,
 * so at least one regular set pack is required.
 */

/** Set codes that are Event Packs rather than a real set, mapped to their entitlement tier. */
export const PROMO_SET_CODES: Readonly<Record<string, 'silver' | 'black'>> = {
  GC2026_SILVER: 'silver',
  GC2026_BLACK: 'black',
}

/** The entitlement tier a set code needs, or null when it's an ordinary set pack. */
export function promoTierForCode(setCode: string): 'silver' | 'black' | null {
  return PROMO_SET_CODES[setCode] ?? null
}

/**
 * Whether opening this pack can yield a Leader. True for every real set (all boosters have
 * a Leader slot); false for Event Packs, whose catalog is Units only.
 */
export function packProvidesLeaders(setCode: string): boolean {
  return promoTierForCode(setCode) === null
}

/** Minimum number of Leader-bearing packs a Chaos Sealed pool must contain. */
export const MIN_LEADER_PACKS = 1

export interface SelectionValidation {
  readonly ok: boolean
  /** Stable reason code for callers that branch; absent when ok. */
  readonly code?: 'noLeaderPack'
  /** User-facing copy. Rendered as-is by the page and returned by the API. */
  readonly message?: string
}

const OK: SelectionValidation = { ok: true }

/**
 * Validate a full Chaos Sealed selection. An empty or partial selection is not an error
 * here — the page gates submission on the pack count separately, and this should stay
 * quiet until there's something real to complain about.
 */
export function validateChaosSealedSelection(setCodes: readonly string[]): SelectionValidation {
  if (setCodes.length === 0) return OK
  if (setCodes.filter(packProvidesLeaders).length >= MIN_LEADER_PACKS) return OK
  return {
    ok: false,
    code: 'noLeaderPack',
    message:
      'Event Packs contain only Units, so a pool built entirely from them has no Leader. Add at least one set pack.',
  }
}
