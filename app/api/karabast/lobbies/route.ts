// GET /api/karabast/lobbies — public Karabast limited lobbies (no auth required)
//
// Why this exists: the lobby board used to get this list ONLY from the
// Wayfinder Companion, relayed over `wayfinder:lobby-list` postMessage. That
// meant anyone without the extension installed saw an empty Karabast section
// forever — the data was there, but only extension users could ever see it.
// Karabast's endpoint is public and unauthenticated, so PTP polls it directly
// and every visitor gets the same live board.
//
// Server-side rather than fetched from the browser: no CORS dependency on a
// third party, one shared cache instead of one request per open tab, and the
// upstream shape is normalised in exactly one place.
import { jsonResponse, handleApiError } from '@/lib/utils'

const KARABAST_LOBBIES_URL = 'https://api.karabast.net/api/available-lobbies'
/** Clients poll every 10s; this keeps us to ~1 upstream call per interval
 *  regardless of how many people have the lobby open. */
const CACHE_MS = 8_000
const FETCH_TIMEOUT_MS = 5_000
/** Matches the Companion's relay cap — a pathological response can't flood the board. */
const LOBBY_CAP = 20

export interface KarabastLobbyDTO {
  name: string
  waiting: number
  isPtp: boolean
  lobbyId: string | null
}

let cache: { at: number; lobbies: KarabastLobbyDTO[] } | null = null
let inflight: Promise<KarabastLobbyDTO[]> | null = null

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * Normalise the upstream entries. The API shape is not ours to pin — today a
 * lobby is `{ id, name, format, cardPool, host }` with no player-count field —
 * so every read is defensive, mirroring the Companion's own mapping.
 */
export function mapKarabastLobbies(raw: unknown): KarabastLobbyDTO[] {
  if (!Array.isArray(raw)) return []
  const out: KarabastLobbyDTO[] = []
  for (const entry of raw) {
    const l = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    // Limited only: that's Karabast's draft + sealed bucket, and the only
    // format a PTP pool can actually be brought to.
    if (l.format !== 'limited') continue
    const name = isNonEmptyString(l.name) ? l.name
      : isNonEmptyString(l.description) ? l.description
      : 'Karabast lobby'
    const waiting = typeof l.playerCount === 'number' && Number.isFinite(l.playerCount) ? l.playerCount
      : Array.isArray(l.players) ? l.players.length
      : 1
    out.push({
      name,
      waiting,
      // PTP-launched lobbies carry the protectthepod.com boilerplate name.
      isPtp: /protectthepod\.com/i.test(name),
      lobbyId: isNonEmptyString(l.id) ? l.id : null,
    })
    if (out.length >= LOBBY_CAP) break
  }
  return out
}

async function loadLobbies(): Promise<KarabastLobbyDTO[]> {
  const res = await fetch(KARABAST_LOBBIES_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`karabast ${res.status}`)
  return mapKarabastLobbies(await res.json())
}

export async function GET(): Promise<Response> {
  try {
    const now = Date.now()
    if (cache && now - cache.at < CACHE_MS) {
      return jsonResponse({ lobbies: cache.lobbies, cached: true })
    }
    // Collapse concurrent misses onto one upstream request.
    inflight ??= loadLobbies()
      .then(lobbies => {
        cache = { at: Date.now(), lobbies }
        return lobbies
      })
      .finally(() => {
        inflight = null
      })

    try {
      const lobbies = await inflight
      return jsonResponse({ lobbies, cached: false })
    } catch {
      // Karabast being down or slow must not surface as a broken PTP board.
      // Serve the last good list if we have one, otherwise an empty one.
      return jsonResponse({ lobbies: cache?.lobbies ?? [], stale: true })
    }
  } catch (error) {
    return handleApiError(error)
  }
}
