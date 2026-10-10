export const DEFAULT_SINCE = '2020-01-01'
export const DEFAULT_UNTIL = '2099-12-31'

// YYYY-MM-DD, with light validation. We hand the value off to Postgres for
// `::date` parsing — we just want to reject obvious garbage early so the
// SQL doesn't blow up with a confusing error.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a date query parameter. Returns the trimmed string if it looks valid,
 * or null if the caller passed an empty value (use the default).
 * Throws on a non-empty value that doesn't match YYYY-MM-DD or that produces
 * NaN when parsed.
 */
export function parseDateParam(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  const trimmed = raw.trim()
  if (!DATE_RE.test(trimmed)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.')
  }
  // Final guard: catches things like 2024-13-99 that match the regex.
  const ts = Date.parse(trimmed + 'T00:00:00Z')
  if (Number.isNaN(ts)) {
    throw new Error('Invalid date value.')
  }
  return trimmed
}

/**
 * Build the JSON body that the route returns. Extracted so unit tests can
 * verify the shape, integer coercion, and zero-counter behavior without
 * touching the database.
 */
export function buildSummaryResponse(
  sealedPacks: number,
  draftPacks: number,
  poolsOpened: number,
  draftsJoined: number,
  decksBuilt: number,
  decksPlayed: number
): {
  packsCracked: number
  poolsOpened: number
  draftsJoined: number
  decksBuilt: number
  decksPlayed: number
} {
  return {
    packsCracked: (sealedPacks | 0) + (draftPacks | 0),
    poolsOpened: poolsOpened | 0,
    draftsJoined: draftsJoined | 0,
    decksBuilt: decksBuilt | 0,
    decksPlayed: decksPlayed | 0,
  }
}

