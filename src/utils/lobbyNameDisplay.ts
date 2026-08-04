import { SET_CONFIGS } from './setConfigs/index'

/**
 * Shorten a Karabast lobby name for display in a board row.
 *
 * Karabast names are free text and run long — "Ashes of the Empire Competitive
 * Practice" is 39 characters before any badge. The board column is bounded by
 * the homepage's button grid, so the name has to give rather than the layout.
 *
 * Two substitutions, both things the row is already saying more compactly:
 *  - a full set name becomes its set code, the abbreviation used on every
 *    badge, filter chip and deck tag in the app ("Ashes of the Empire" → ASH)
 *  - the protectthepod.com attribution suffix is dropped, because the row
 *    already carries the ✓ validated marker that means exactly that
 *
 * Anything else is left alone: this abbreviates, it doesn't summarise.
 */

const PTP_SUFFIX = /\s*protectthepod\.com\s*$/i

/** Longest first, so "A Lawless Time" can't be shadowed by a shorter match. */
const SET_NAMES: { name: string; code: string }[] = Object.values(SET_CONFIGS)
  .filter(c => typeof c.setName === 'string' && c.setName.length > 0)
  .map(c => ({ name: String(c.setName), code: String(c.setCode) }))
  .sort((a, b) => b.name.length - a.name.length)

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function shortenLobbyName(raw: string | null | undefined): string {
  let name = (raw || '').trim()
  if (!name) return 'Karabast lobby'
  name = name.replace(PTP_SUFFIX, '').trim()
  for (const { name: full, code } of SET_NAMES) {
    name = name.replace(new RegExp(escapeRegExp(full), 'gi'), code)
  }
  // Collapse whitespace left behind by a removed suffix.
  name = name.replace(/\s{2,}/g, ' ').trim()
  return name || 'Karabast lobby'
}
