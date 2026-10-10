import { queryRows } from '../db'
import { getAllCards } from '../../src/utils/cardData'
import type { NativeDeckVersion } from '../../src/services/play/deckVersions'

type GameplayDeck = Pick<NativeDeckVersion, 'poolId' | 'poolShareId' | 'setCode' | 'poolType' | 'leader' | 'base' | 'deck'>
export interface PtpGame {
  id: string
  kind: 'solo' | 'human'
  opponent: string
  seat: number
  result: 'player1' | 'player2' | 'draw'
  played_at: string | Date
  deck: GameplayDeck
  opponent_deck: GameplayDeck
}

export async function ptpGameplay(userId:string,since:string,until:string,setCode:string,opponents:string[]){
 const rows=await queryRows(`SELECT * FROM (
 SELECT g.id,'solo' AS kind,p.name AS opponent,0 AS seat,g.result,
 COALESCE(to_timestamp((g.record_json->'commands'->-1->>'acceptedAtMs')::numeric/1000),g.created_at) AS played_at,
 g.deck_snapshots->0 AS deck,g.deck_snapshots->1 AS opponent_deck
 FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id
 JOIN ptp_solo_ai_matches m ON m.id=g.match_id
 JOIN ptp_solo_ai_participants p ON p.run_id=r.id AND p.id=m.player2
 WHERE r.owner_user_id=$1 AND m.player1='human' AND p.kind='ai' AND g.result IS NOT NULL
 UNION ALL
 SELECT m.id,'human',u.username,s.seat,m.result,m.completed_at,v.snapshot,ov.snapshot
 FROM ptp_native_matches m JOIN ptp_native_match_seats s ON s.match_id=m.id AND s.user_id=$1
 JOIN ptp_native_match_seats os ON os.match_id=m.id AND os.seat<>s.seat
 JOIN users u ON u.id=os.user_id JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id
 JOIN ptp_play_deck_versions ov ON ov.id=os.deck_version_id
 WHERE m.status='complete' AND m.result IS NOT NULL
 ) games WHERE played_at >= $2::date AND played_at < ($3::date+interval '1 day')
 AND ($4='all' OR deck->>'setCode'=$4)
 AND CASE WHEN kind='solo' THEN 'ai' ELSE 'human' END = ANY($5::text[])
 ORDER BY played_at DESC`,[userId,since,until,setCode,opponents])
 return rows as unknown as PtpGame[]
}
export function gameOutcome(game: Pick<PtpGame, 'seat' | 'result'>) {
  return game.result === 'draw' ? 'draw' : game.result === `player${game.seat + 1}` ? 'win' : 'loss'
}

let cardIndex: Map<string, ReturnType<typeof getAllCards>[number]> | undefined
export function snapshotState(deck: GameplayDeck) {
  cardIndex ??= new Map(getAllCards().filter(c => c.variantType === 'Normal')
    .map(c => [`${c.set}_${String(c.number).padStart(3, '0')}`, c]))
  return {
    activeLeader: 'leader', activeBase: 'base',
    cardPositions: {
      leader: { card: cardIndex.get(deck.leader) },
      base: { card: cardIndex.get(deck.base) },
    },
  }
}
