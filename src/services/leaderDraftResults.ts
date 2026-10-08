import type { CardData } from '../components/Card'

export type LeaderResultCard = CardData & { backImageUrl?: string }
export interface LeaderResultPlayer {
  seatNumber: number
  username: string
  leaders: LeaderResultCard[] | null
}
export interface LeaderResultRow {
  user_id: string
  seat_number: number
  username: string
  is_bot?: boolean
  is_log_public?: boolean
  drafted_leaders: LeaderResultCard[] | string | null
}

/** Match draft-log visibility; never send hidden cards to the browser. */
export function leaderDraftResults(players: LeaderResultRow[], viewerId: string | undefined, hostId: string, isPublic: boolean): LeaderResultPlayer[] {
  const participant = players.some(p => p.user_id === viewerId)
  return [...players].sort((a, b) => a.seat_number - b.seat_number).map(player => {
    const visible = isPublic || viewerId === hostId || player.is_log_public ||
      (participant && (player.user_id === viewerId || player.is_bot))
    const cards = visible && typeof player.drafted_leaders === 'string'
      ? JSON.parse(player.drafted_leaders) : player.drafted_leaders
    return {
      seatNumber: player.seat_number,
      username: player.username,
      leaders: visible ? (Array.isArray(cards) ? cards : []) : null,
    }
  })
}
