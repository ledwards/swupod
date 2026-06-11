// @ts-nocheck
// API utilities for fetching card/set data

// Summary + fetch-based card access (NOT cardData) — api.ts is imported by
// most client pages; a cardData import here would drag the 8 MB cards.json
// into their bundles (U5, foundations hardening).
import { hasCardsForSet } from './cardSummary'
import { loadCardsBySet } from './cardDataClient'
import { getPackArtUrl } from './packArt'
import { getUpcomingSetForPeek, hasUpcomingSetSpoilers } from './membership'
import type { RawCard } from './cardData'

interface SetInfo {
  code: string
  name: string
  prereleaseDate?: string
  releaseDate: string
  carbonite?: boolean
  imageUrl: string | null
  /**
   * Marker for the "Coming Soon" teaser card injected by peekUnreleased.
   * Set when the set is sourced from src/utils/setConfigs/ via
   * getUpcomingSetForPeek() rather than from knownSets. Consumers render
   * this as a non-selectable teaser that opens SubscribeModal on click.
   */
  comingSoon?: boolean
}

/**
 * Check if a set is in beta state (before prereleaseDate)
 */
export function isSetBeta(set: { prereleaseDate?: string }): boolean {
  if (!set.prereleaseDate) return false
  return new Date().toISOString() < new Date(set.prereleaseDate + 'T00:00:00Z').toISOString()
}

/**
 * Check if a set is in pre-release state (between prereleaseDate and releaseDate)
 */
export function isSetPrerelease(set: { prereleaseDate?: string; releaseDate?: string }): boolean {
  if (!set.prereleaseDate || !set.releaseDate) return false
  const now = new Date().toISOString()
  return now >= new Date(set.prereleaseDate + 'T00:00:00Z').toISOString() &&
         now < new Date(set.releaseDate + 'T00:00:00Z').toISOString()
}

interface FetchSetsOptions {
  includeBeta?: boolean
  includeCarbonite?: boolean
  /**
   * Append a single "Coming Soon" teaser for the next unreleased set,
   * sourced from src/utils/setConfigs/ (bypasses isSetVisibleInCatalog's
   * hasRealCardsForSet gate). The injected entry has comingSoon: true so
   * the picker UI can render it as a non-selectable teaser. Skipped when
   * getUpcomingSetForPeek() returns null (no upcoming set configured).
   */
  peekUnreleased?: boolean
}

export function isSetVisibleInCatalog(set: { code: string }): boolean {
  const baseCode = set.code.replace('-CB', '')
  if (baseCode === 'ASH') {
    return hasUpcomingSetSpoilers('ASH')
  }
  return true
}

/**
 * Fetch all sets
 * Returns array of set objects with code, name, and imageUrl
 * @param options - Options
 * @param options.includeBeta - Include beta sets (default: false)
 * @param options.includeCarbonite - Include Carbonite pack entries (default: false)
 * @param options.peekUnreleased - Append a "Coming Soon" teaser for the
 *   next unreleased set from src/utils/setConfigs/ (default: false). The
 *   appended entry has comingSoon: true so callers can render it as a
 *   non-selectable teaser that opens SubscribeModal on click. Skipped if
 *   getUpcomingSetForPeek() returns null. Skipped if the upcoming set is
 *   already present (subs/beta-testers don't see a duplicate ASH).
 */
export async function fetchSets({
  includeBeta = false,
  includeCarbonite = false,
  peekUnreleased = false,
}: FetchSetsOptions = {}): Promise<SetInfo[]> {
  // Use hardcoded set data for the expansion sets
  // External API calls fail due to CORS, so we use local data
  const knownSets = [
    { code: 'SOR', name: 'Spark of Rebellion', prereleaseDate: '2024-03-01', releaseDate: '2024-03-08' },
    { code: 'SHD', name: 'Shadows of the Galaxy', prereleaseDate: '2024-07-05', releaseDate: '2024-07-12' },
    { code: 'TWI', name: 'Twilight of the Republic', prereleaseDate: '2024-11-01', releaseDate: '2024-11-08' },
    { code: 'JTL', name: 'Jump to Lightspeed', prereleaseDate: '2025-03-07', releaseDate: '2025-03-14' },
    { code: 'JTL-CB', name: 'Jump to Lightspeed Carbonite Edition', prereleaseDate: '2025-03-07', releaseDate: '2025-03-14', carbonite: true },
    { code: 'LOF', name: 'Legends of the Force', prereleaseDate: '2025-07-04', releaseDate: '2025-07-11' },
    { code: 'LOF-CB', name: 'Legends of the Force Carbonite Edition', prereleaseDate: '2025-07-04', releaseDate: '2025-07-11', carbonite: true },
    { code: 'SEC', name: 'Secrets of Power', prereleaseDate: '2025-10-31', releaseDate: '2025-11-07' },
    { code: 'SEC-CB', name: 'Secrets of Power Carbonite Edition', prereleaseDate: '2025-10-31', releaseDate: '2025-11-07', carbonite: true },
    { code: 'LAW', name: 'A Lawless Time', prereleaseDate: '2026-03-06', releaseDate: '2026-03-13' },
    { code: 'LAW-CB', name: 'A Lawless Time Carbonite Edition', prereleaseDate: '2026-03-06', releaseDate: '2026-03-13', carbonite: true },
    { code: 'ASH', name: 'Ashes of the Empire', prereleaseDate: '2026-07-10', releaseDate: '2026-07-17' },
    { code: 'ASH-CB', name: 'Ashes of the Empire Carbonite Edition', prereleaseDate: '2026-07-10', releaseDate: '2026-07-17', carbonite: true },
  ]

  let filteredSets = knownSets.filter(isSetVisibleInCatalog)

  // Filter out beta (pre-prereleaseDate) sets unless explicitly requested
  if (!includeBeta) {
    filteredSets = filteredSets.filter((set) => !isSetBeta(set))
  }
  if (!includeCarbonite) {
    filteredSets = filteredSets.filter((set) => !set.carbonite)
  }
  // Always hide sets that have no card data yet, even when other gates would
  // otherwise let them through. ASH has a stricter real-card gate above.
  filteredSets = filteredSets.filter((set) => hasCardsForSet(set.code))

  const mapped: SetInfo[] = filteredSets.map((set) => ({
    ...set,
    imageUrl: getPackArtUrl(set.code),
  }))

  // Append the "Coming Soon" teaser for the next unreleased set, sourced
  // from src/utils/setConfigs/ (not knownSets). This bypasses the
  // isSetVisibleInCatalog hasRealCardsForSet gate that would otherwise drop
  // ASH today. The teaser is appended only when the upcoming set isn't
  // already present in the catalog (so subs / beta-testers don't see a
  // duplicate ASH card).
  if (peekUnreleased) {
    const upcoming = getUpcomingSetForPeek()
    if (upcoming && !mapped.some((s) => s.code === upcoming.setCode)) {
      mapped.push({
        code: upcoming.setCode,
        name: upcoming.setName,
        prereleaseDate: upcoming.prereleaseDate,
        releaseDate: upcoming.releaseDate,
        imageUrl: getPackArtUrl(upcoming.setCode),
        comingSoon: true,
      })
    }
  }

  return mapped
}

/**
 * Fetch all cards for a specific set
 * Returns array of card objects with imageUrl, rarity, type, etc.
 *
 * Served by GET /api/cards (corrected data, long-lived cache headers) via the
 * memoized client loader — the static cards.json import this used to rely on
 * pulled the whole card database into every consumer's bundle.
 */
export async function fetchSetCards(setCode: string): Promise<RawCard[]> {
  try {
    const cards = await loadCardsBySet(setCode)
    if (cards.length > 0) {
      return cards
    }
  } catch (error) {
    console.warn('Failed to load card data from /api/cards', error)
  }

  console.warn(`Unable to fetch card data for set ${setCode}. Card data may need to be populated.`)
  return []
}
