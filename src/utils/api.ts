// @ts-nocheck
// API utilities for fetching card/set data

import { getCardsBySet, hasRealCardsForSet } from './cardData'
import { getPackArtUrl } from './packArt'
import type { RawCard } from './cardData'

interface SetInfo {
  code: string
  name: string
  prereleaseDate?: string
  releaseDate: string
  carbonite?: boolean
  imageUrl: string | null
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
}

export function isSetVisibleInCatalog(set: { code: string }): boolean {
  const baseCode = set.code.replace('-CB', '')
  if (baseCode === 'ASH') {
    return hasRealCardsForSet('ASH')
  }
  return true
}

/**
 * Fetch all sets
 * Returns array of set objects with code, name, and imageUrl
 * @param options - Options
 * @param options.includeBeta - Include beta sets (default: false)
 * @param options.includeCarbonite - Include Carbonite pack entries (default: false)
 */
export async function fetchSets({ includeBeta = false, includeCarbonite = false }: FetchSetsOptions = {}): Promise<SetInfo[]> {
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
  ]

  let filteredSets = knownSets.filter(isSetVisibleInCatalog)

  // Filter out beta (pre-prereleaseDate) sets unless explicitly requested
  if (!includeBeta) {
    filteredSets = filteredSets.filter((set) => !isSetBeta(set))
  }
  if (!includeCarbonite) {
    filteredSets = filteredSets.filter((set) => !set.carbonite)
  }

  return filteredSets.map((set) => ({
    ...set,
    imageUrl: getPackArtUrl(set.code),
  }))
}

/**
 * Fetch all cards for a specific set
 * Returns array of card objects with imageUrl, rarity, type, etc.
 */
export async function fetchSetCards(setCode: string): Promise<RawCard[]> {
  // Load from local card data file
  // External API calls fail due to CORS, so we use local data
  try {
    const localCards = getCardsBySet(setCode)
    if (localCards.length > 0) {
      return localCards
    }
  } catch (error) {
    console.warn('Failed to load local card data', error)
  }

  console.warn(`Unable to fetch card data for set ${setCode}. Card data file may need to be populated.`)
  return []
}
