import { queryRow } from '../../../lib/db'
import { decksPublicOf, mayReplay } from './hubView'

const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)

/**
 * A recorded pod game the user may replay, or null. Only native games that
 * finished on the engine qualify (bot-vs-bot coin flips have no record), and
 * the viewer follows the deck rule in `mayReplay`.
 */
export async function podReplayAccess(gameId: string, userId: string): Promise<{ shareId: string; matchId: string; seat: number } | null> {
  const row = await queryRow(`SELECT p.share_id,m.id AS match_id,m.player1_id,m.player2_id,p.host_id,p.settings,
      (SELECT s.seat FROM ptp_native_match_seats s WHERE s.match_id=g.id AND s.user_id=$2) AS seat,
      EXISTS(SELECT 1 FROM pod_players pp WHERE pp.pod_id=p.id AND pp.user_id=$2 AND pp.is_bot=false) AS member
    FROM pod_tournament_games g JOIN pod_tournament_matches m ON m.id=g.match_id JOIN pods p ON p.id=m.pod_id
    JOIN ptp_native_matches n ON n.id=g.id
    WHERE g.id=$1 AND g.source='native' AND g.result IS NOT NULL AND n.status='complete'`, [gameId, userId])
  if (!row) return null
  const participant = String(row.player1_id) === userId || String(row.player2_id) === userId
  const allowed = mayReplay({ participant, host: String(row.host_id) === userId, decksPublic: decksPublicOf(parse(row.settings)), humanMember: row.member === true })
  return allowed ? { shareId: String(row.share_id), matchId: String(row.match_id), seat: row.seat == null ? 0 : Number(row.seat) } : null
}
