import { stripArchetypeTags } from './archetypeName'

/** Fallback public-lobby name when we can't build a more specific one. */
export const KARABAST_PUBLIC_LOBBY_NAME = 'Limited Draft through protectthepod.com'

const PTP_SUFFIX = 'protectthepod.com'

/** A Karabast lobby id is a standard UUID. */
const LOBBY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether `raw` is a valid Karabast private-lobby URL.
 *
 * Karabast serves these as `https://karabast.net/lobby?lobbyId=<uuid>` (and
 * historically `https://karabast.net/?lobbyId=<uuid>`). We validate the host
 * and a well-formed `lobbyId` rather than pinning the exact path — Karabast has
 * already moved the path once, and parsing also tolerates whitespace, query
 * param order, and extra params.
 */
export function isValidPrivateLobbyUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host !== 'karabast.net' && host !== 'www.karabast.net') return false
  const lobbyId = url.searchParams.get('lobbyId')
  return !!lobbyId && LOBBY_ID_PATTERN.test(lobbyId)
}

/** Ensure a lobby/game name ends with the protectthepod.com attribution. */
export function appendProtectThePod(name: string | null | undefined): string {
  const n = (name || '').trim()
  if (!n) return PTP_SUFFIX
  return n.toLowerCase().endsWith(PTP_SUFFIX) ? n : `${n} ${PTP_SUFFIX}`
}

/**
 * Build the public Karabast game name for a PTP pool, e.g.
 * "SEC Draft Leia Splash Green protectthepod.com" — so public games are
 * attributable to Protect the Pod and announce the set / format / deck. The
 * archetype's set/"(Limited)" tags are stripped (the set is already the prefix),
 * and the name always ends with protectthepod.com. Pieces drop gracefully when
 * unknown.
 */
export function buildLobbyName(opts: {
  setCode?: string | null
  poolType?: string | null
  archetypeName?: string | null
}): string {
  const set = (opts.setCode || '').trim().toUpperCase()
  const format = /draft|rotisserie/i.test(opts.poolType || '') ? 'Draft' : 'Sealed'
  const archetype = stripArchetypeTags(opts.archetypeName || '').trim()
  const base = [set, format, archetype].filter(Boolean).join(' ')
  return appendProtectThePod(base)
}
