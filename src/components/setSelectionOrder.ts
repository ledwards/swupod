// Display order for the set picker.
//
// Pure helpers, extracted from SetSelection so they can be tested directly —
// same shape as setSelectionTeaser.ts (the project's test runner is Node's
// built-in runner with no JSX rendering tooling).
//
// The picker draws two containers: a "latest sets" row (set 7 and up) above a
// grid of everything older. On desktop those are two visually distinct blocks;
// on mobile both collapse to a single column, so the two together read as one
// list and must be ordered as one list.

/** Sets numbered this and above render in the latest-sets row above the grid. */
export const LATEST_SET_THRESHOLD = 7

const SET_NUMBERS: Record<string, number> = {
  'SOR': 1, // Spark of Rebellion
  'SHD': 2, // Shadows of the Galaxy
  'TWI': 3, // Twilight of the Republic
  'JTL': 4, // Jump to Lightspeed
  'LOF': 5, // Legends of the Force
  'SEC': 6, // Secrets of Power
  'LAW': 7, // A Lawless Time
  'ASH': 8, // Ashes of the Empire
  // Future sets will be 9, 10, etc.
}

/**
 * Unknown sets — an unreleased set behind the "Coming Soon" teaser — sort last
 * in the desktop grid, and first in the newest-first mobile column.
 */
export function getSetNumber(setCode: string): number {
  return SET_NUMBERS[setCode] ?? 999
}

// Desktop grid order: [7, 8, 9, 4, 5, 6, 1, 2, 3] — rows of three, newest row
// on top. Future-proof: when 7, 8, 9 are all out they fill the first row.
const DESKTOP_DISPLAY_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3]

export interface SetLike {
  code: string
}

/**
 * Sort sets for display.
 *
 * vertical (single column, mobile): newest first, straight descending.
 * otherwise: the fixed desktop grid order above.
 */
export function sortSetsForDisplay<T extends SetLike>(sets: T[], vertical = false): T[] {
  return [...sets].sort((a, b) => {
    const numA = getSetNumber(a.code)
    const numB = getSetNumber(b.code)

    if (vertical) return numB - numA

    const indexA = DESKTOP_DISPLAY_ORDER.indexOf(numA)
    const indexB = DESKTOP_DISPLAY_ORDER.indexOf(numB)

    // Anything outside the fixed order goes to the end.
    if (indexA === -1 && indexB === -1) return numA - numB
    if (indexA === -1) return 1
    if (indexB === -1) return -1

    return indexA - indexB
  })
}

/**
 * Split the fetched sets into the two containers the picker renders, each in
 * display order. Rendering `latest` then `regular` gives the on-screen order.
 */
export function splitSetsForDisplay<T extends SetLike>(
  sets: T[],
  vertical = false,
): { latest: T[]; regular: T[] } {
  const latest = sets.filter((set) => getSetNumber(set.code) >= LATEST_SET_THRESHOLD)
  const regular = sets.filter((set) => getSetNumber(set.code) < LATEST_SET_THRESHOLD)

  return {
    // Sorted, not left in fetch order: on mobile this row is simply the top of
    // the single column, so it has to carry the same newest-first order as the
    // grid below it or the column reads 7, 8, 6, 5, ...
    latest: sortSetsForDisplay(latest, vertical),
    regular: sortSetsForDisplay(regular, vertical),
  }
}
