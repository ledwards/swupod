/**
 * Pack Selector Sorting Utilities
 *
 * Pure functions for sorting sets in the PackSelector component.
 * Regular boosters appear in the main grid; carbonite packs appear
 * below a separator line.
 */

export interface SetData {
  code: string
  name: string
  imageUrl?: string
  prereleaseDate?: string
  releaseDate?: string
  carbonite?: boolean
  /**
   * Marker for the "Coming Soon" teaser injected by
   * fetchSets({ peekUnreleased: true }). Renderers should show a
   * non-selectable teaser that opens SubscribeModal on click.
   */
  comingSoon?: boolean
}

/** Strip -CB suffix to get the base set code */
export function getBaseCode(setCode: string): string {
  return setCode.replace('-CB', '')
}

/** Map set code to its release order number */
export function getSetNumber(setCode: string): number {
  const base = getBaseCode(setCode)
  const setCodeMap: Record<string, number> = {
    'SOR': 1, 'SHD': 2, 'TWI': 3,
    'JTL': 4, 'LOF': 5, 'SEC': 6,
    'LAW': 7, 'ASH': 8,
  }
  return setCodeMap[base] || 999
}

/**
 * Sort sets for display: regular boosters on top, carbonite below the line.
 * Within each group, sets are sorted by release order.
 */
export function sortSetsForDisplay(sets: SetData[]): { main: SetData[], carbonite: SetData[] } {
  const main: SetData[] = []
  const carbonite: SetData[] = []

  for (const set of sets) {
    if (set.carbonite) {
      carbonite.push(set)
    } else {
      main.push(set)
    }
  }

  main.sort((a, b) => getSetNumber(a.code) - getSetNumber(b.code))
  carbonite.sort((a, b) => getSetNumber(a.code) - getSetNumber(b.code))

  return { main, carbonite }
}
