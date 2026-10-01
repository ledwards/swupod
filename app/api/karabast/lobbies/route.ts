import { legacyPlayRetired } from '@/src/services/play/legacyRetirement'
const LOBBY_CAP = 20
export interface KarabastLobbyDTO {
  name: string
  waiting: number
  isPtp: boolean
  lobbyId: string | null
}


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

// No upstream request is made, including requests from stale open tabs.
export function GET() { return legacyPlayRetired() }
