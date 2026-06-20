// Centralized Wayfinder URL builders.
//
// The Companion site and the replay player live on DIFFERENT origins:
//   - plugin.wayfinder.news  → the Companion site (your matches list, account)
//   - replay.wayfinder.news  → public replay playback
//
// A match's replay is always reachable at `/playback/<matchId>`, so we DERIVE
// the replay link from the match id rather than trusting whatever URL was stored
// at capture time. Older captures stored a broken `wayfinder.news/live/<id>`
// form; deriving from the id makes every link canonical and correct.

const COMPANION_BASE = (process.env.NEXT_PUBLIC_WAYFINDER_URL || 'https://plugin.wayfinder.news').replace(/\/+$/, '')
const REPLAY_BASE = (process.env.NEXT_PUBLIC_WAYFINDER_REPLAY_URL || 'https://replay.wayfinder.news').replace(/\/+$/, '')

/**
 * The replay player and the Companion matches page both key off the BARE capture
 * `event_id` (`match_<ts>_<rand>`). Wayfinder's server-side ingestion gameId adds
 * an `ing-` prefix (`ing-${eventId}`), and PTP stores that gameId in
 * `wayfinder_match_id` — so an `ing-...` id reaches the URL and matches no event
 * ("This replay is out of range" + Discord login). Strip it here.
 */
function canonicalEventId(matchId: string | null | undefined): string {
  return (matchId || '').trim().replace(/^ing-/, '')
}

/**
 * Canonical public replay-playback URL for a Wayfinder match id, e.g.
 * `https://replay.wayfinder.news/playback/match_1781829124602_3osa8h`.
 * Returns '' when there is no match id.
 */
export function wayfinderReplayUrl(matchId: string | null | undefined): string {
  const id = canonicalEventId(matchId)
  if (!id) return ''
  return `${REPLAY_BASE}/playback/${id}`
}

/** The Companion "your matches" list, or a single match when an id is given. */
export function wayfinderMatchesUrl(matchId?: string | null): string {
  const id = canonicalEventId(matchId)
  return id ? `${COMPANION_BASE}/matches/${id}` : `${COMPANION_BASE}/matches`
}

/**
 * The replay link to surface for a match. Prefer a stored canonical playback
 * URL (the Companion now sends one), and otherwise derive it from the match id —
 * which repairs older captures that stored a broken wayfinder.news/live/ URL.
 */
export function resolveReplayUrl(matchId: string | null | undefined, storedUrl?: string | null): string {
  const stored = (storedUrl || '').trim()
  if (stored.includes('/playback/')) {
    // Canonicalize even a stored playback URL: a Companion build briefly sent
    // `/playback/ing-<id>`, which matches no event and 404s.
    return stored.replace('/playback/ing-', '/playback/')
  }
  return wayfinderReplayUrl(matchId) || stored
}
