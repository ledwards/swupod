import type { CardData } from '../components/Card'

export type LeaderResultCard = CardData & { backImageUrl?: string }
/** What a player actually played: the leader and base of their built deck, and the pool to open it from. */
export interface LeaderResultDeck {
  leader: LeaderResultCard | null
  base: LeaderResultCard | null
  /** Only for the deck's owner and the host, or every pod member once the host made decks and pools public. */
  poolShareId: string | null
}
export interface LeaderResultPlayer {
  seatNumber: number
  username: string
  isBot: boolean
  leaders: LeaderResultCard[] | null
  /** Null while the player has no built deck, or when their seat is private. */
  deck: LeaderResultDeck | null
}
export interface LeaderResultRow {
  user_id: string
  seat_number: number
  username: string
  is_bot?: boolean
  is_log_public?: boolean
  drafted_leaders: LeaderResultCard[] | string | null
  /** The player's draft pool and its built deck's leader and base entries ({id: "HMW_003"}). */
  pool_share_id?: string | null
  built_leader?: unknown
  built_base?: unknown
}
export type ResolveDeckCard = (id: unknown, kind: 'leader' | 'base') => LeaderResultCard | null

const parse = (v: unknown) => { if (typeof v !== 'string') return v; try { return JSON.parse(v) } catch { return null } }
const entryId = (v: unknown) => { const e = parse(v) as { id?: unknown } | null; return e && typeof e === 'object' ? e.id : null }

/**
 * Leaders match draft-log visibility. A deck's pool (the deck image and pool) opens for its owner and the
 * host, or for every pod member when the host made decks and pools public. Never send hidden cards
 * (or a hidden pool's link) to the browser.
 */
export function leaderDraftResults(players: LeaderResultRow[], viewerId: string | undefined, hostId: string, isPublic: boolean, resolve?: ResolveDeckCard, decksPublic = false): LeaderResultPlayer[] {
  const participant = players.some(p => p.user_id === viewerId)
  return [...players].sort((a, b) => a.seat_number - b.seat_number).map(player => {
    const visible = isPublic || viewerId === hostId || player.is_log_public ||
      (participant && (player.user_id === viewerId || player.is_bot))
    const open = !!viewerId && (player.user_id === viewerId || viewerId === hostId || (decksPublic && participant))
    const cards = visible && typeof player.drafted_leaders === 'string'
      ? JSON.parse(player.drafted_leaders) : player.drafted_leaders
    const built = (visible || open) && player.pool_share_id && player.built_leader && player.built_base
    return {
      seatNumber: player.seat_number,
      username: player.username,
      isBot: player.is_bot === true,
      leaders: visible ? (Array.isArray(cards) ? cards : []) : null,
      deck: built ? {
        leader: resolve?.(entryId(player.built_leader), 'leader') ?? null,
        base: resolve?.(entryId(player.built_base), 'base') ?? null,
        poolShareId: open ? String(player.pool_share_id) : null,
      } : null,
    }
  })
}
