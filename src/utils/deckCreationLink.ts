/**
 * "Make the deck this listing needs" — the URL + action copy for a player who
 * wants to join an open game but has no eligible deck for it.
 *
 * The ineligible-deck prompt is the right UX ("you don't have an ASH Sealed
 * deck yet"), and sealed pack count is just one more reason you might not have
 * the right deck. This turns that prompt into a working deep link with the set
 * AND pack count already chosen.
 *
 * SPEC:
 *  1. SEALED, single set → `/pools/new?set=<CODE>&packs=<N>`. Verified end to
 *     end: that route reads both params, deals exactly N packs, works logged
 *     out, and validates `packs` to 6 or 8 (anything else falls back to 6).
 *  2. DRAFT → `/draft/solo`. There is deliberately NO `?set=` here: no draft
 *     route accepts a set param, and `/draft/solo` creates a draft and seats 7
 *     bots the moment a set is chosen — auto-firing that from a link would
 *     create rows on page load and needs auth. Never emit `packs` for draft.
 *  3. MULTI-SET codes (Chaos, comma-separated) and every other pool type
 *     (pack_wars, pack_blitz, rotisserie, imported) → `/formats`. `/pools/new`
 *     takes one set code, so a comma-joined code must never be forwarded.
 *  4. NO set code → the format's own set picker (`/sealed`, `/draft/solo`).
 *  5. Set codes are URL-encoded; `packs` is emitted only when known.
 */
import { packCountLabel } from './sealedFormat'

export interface ListingDeckNeed {
  /** The listing's set code (`card_pools.set_code`). */
  setCode?: string | null | undefined
  /** The listing's format (`card_pools.pool_type`). */
  format?: string | null | undefined
  /** Sealed pack bucket — 6-pack and 8-pack sealed are different formats. */
  packsPerPlayer?: number | null | undefined
}

export interface DeckCreationLink {
  /** Where to send the player to create the deck this listing needs. */
  href: string
  /** Action copy, e.g. "Make a LAW Sealed (8-pack) pool". */
  label: string
}

/** A set code usable as a `?set=` param: present and not a multi-set list. */
function singleSetCode(setCode?: string | null): string | null {
  const trimmed = (setCode || '').trim()
  if (!trimmed || trimmed.includes(',')) return null
  return trimmed
}

export function deckCreationLinkForListing({
  setCode,
  format,
  packsPerPlayer,
}: ListingDeckNeed): DeckCreationLink {
  const set = singleSetCode(setCode)

  // SPEC 2: draft — no set param exists, and none should be invented.
  if (format === 'draft') {
    return {
      href: '/draft/solo',
      label: set ? `Start a ${set} Draft` : 'Start a Solo Draft',
    }
  }

  // SPEC 3: Chaos and the other formats have their own homes.
  if (format != null && format !== 'sealed') {
    return { href: '/formats', label: 'Browse other formats' }
  }

  // SPEC 4: sealed with no usable set code → the sealed set picker.
  if (!set) {
    return { href: '/sealed', label: 'Start a Solo Sealed' }
  }

  // SPEC 1 + 5: sealed deep link, pack count included when known.
  const packs = packCountLabel(packsPerPlayer)
  const query = `set=${encodeURIComponent(set)}${packs ? `&packs=${packsPerPlayer}` : ''}`
  return {
    href: `/pools/new?${query}`,
    label: `Make a ${set} Sealed${packs ? ` (${packs})` : ''} pool`,
  }
}
