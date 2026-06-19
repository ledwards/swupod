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
 * Canonical public replay-playback URL for a Wayfinder match id, e.g.
 * `https://replay.wayfinder.news/playback/match_1781829124602_3osa8h`.
 * Returns '' when there is no match id.
 */
export function wayfinderReplayUrl(matchId: string | null | undefined): string {
  const id = (matchId || '').trim()
  if (!id) return ''
  return `${REPLAY_BASE}/playback/${id}`
}

/** The Companion "your matches" list, or a single match when an id is given. */
export function wayfinderMatchesUrl(matchId?: string | null): string {
  const id = (matchId || '').trim()
  return id ? `${COMPANION_BASE}/matches/${id}` : `${COMPANION_BASE}/matches`
}

/**
 * The replay link to surface for a match. Prefer a stored canonical playback
 * URL (the Companion now sends one), and otherwise derive it from the match id —
 * which repairs older captures that stored a broken wayfinder.news/live/ URL.
 */
export function resolveReplayUrl(matchId: string | null | undefined, storedUrl?: string | null): string {
  const stored = (storedUrl || '').trim()
  if (stored.includes('/playback/')) return stored
  return wayfinderReplayUrl(matchId) || stored
}
