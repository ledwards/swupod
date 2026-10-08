/**
 * Deck editor view preferences — remembered ACROSS pools, not per pool.
 *
 * SPEC:
 * - View mode (Arena / Playmat / Table) and pool/deck card density
 *   (small / medium / large) are sticky: the last choice a player made becomes
 *   their default the next time they open ANY deck editor, in any session.
 * - Per-pool state (`deckBuilderUI_<key>`) still wins for a pool the player has
 *   already arranged; these preferences only supply the default for a pool with
 *   no saved view state of its own.
 * - Unknown / corrupt values are ignored rather than thrown, so a bad write can
 *   never break the deck editor.
 */

export type DeckViewMode = 'arena' | 'grid' | 'list'
export type DeckCardDensity = 'small' | 'medium' | 'large'

export interface DeckViewPreferences {
  viewMode?: DeckViewMode
  poolCardDensity?: DeckCardDensity
  deckCardDensity?: DeckCardDensity
}

/** Single site-wide key for the cross-pool view preferences. */
export const DECK_VIEW_PREFERENCES_KEY = 'deckBuilderViewPreferences'

const VIEW_MODES: readonly DeckViewMode[] = ['arena', 'grid', 'list']
const CARD_DENSITIES: readonly DeckCardDensity[] = ['small', 'medium', 'large']

/** Parse a stored preferences blob, dropping anything unrecognized. */
export function parseDeckViewPreferences(raw: string | null | undefined): DeckViewPreferences {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const source = parsed as Record<string, unknown>
  const prefs: DeckViewPreferences = {}

  if (VIEW_MODES.includes(source.viewMode as DeckViewMode)) {
    prefs.viewMode = source.viewMode as DeckViewMode
  }
  if (CARD_DENSITIES.includes(source.poolCardDensity as DeckCardDensity)) {
    prefs.poolCardDensity = source.poolCardDensity as DeckCardDensity
  }
  if (CARD_DENSITIES.includes(source.deckCardDensity as DeckCardDensity)) {
    prefs.deckCardDensity = source.deckCardDensity as DeckCardDensity
  }

  return prefs
}

/** Read the player's saved view preferences. Returns {} on SSR or on any error. */
export function readDeckViewPreferences(): DeckViewPreferences {
  if (typeof window === 'undefined') return {}
  try {
    return parseDeckViewPreferences(localStorage.getItem(DECK_VIEW_PREFERENCES_KEY))
  } catch {
    return {}
  }
}

/**
 * Merge a change into the saved preferences — a player changing one control
 * makes that the new default without disturbing the others.
 * Returns the merged preferences (also on SSR, where nothing is persisted).
 */
export function saveDeckViewPreference(patch: DeckViewPreferences): DeckViewPreferences {
  const merged = { ...readDeckViewPreferences(), ...parseDeckViewPreferences(JSON.stringify(patch)) }
  if (typeof window === 'undefined') return merged
  try {
    localStorage.setItem(DECK_VIEW_PREFERENCES_KEY, JSON.stringify(merged))
  } catch (error) {
    console.warn('Failed to persist deck view preferences:', error)
  }
  return merged
}
