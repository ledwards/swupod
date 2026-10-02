import {soloSession} from '@/lib/play/soloAuth'
import {soloGameRecord} from '@/lib/play/soloRecords'
import {respond,uuid} from '@/src/services/play/native/http'
import {trainingExamples} from '@/src/services/play/native/gameRecords'
import {queryRow} from '@/lib/db'
export function GET(request:Request,context:{params:Promise<{gameId:string}>}){return respond(async()=>{
 const session=await soloSession(request),id=uuid((await context.params).gameId)
 const saved=await soloGameRecord(id,session.id)
 const metadata=await queryRow(`SELECT g.run_id,g.match_id,g.game_no,m.round,p1.kind AS seat0_kind,p2.kind AS seat1_kind
 FROM ptp_solo_ai_games g JOIN ptp_solo_ai_matches m ON m.id=g.match_id
 JOIN ptp_solo_ai_participants p1 ON p1.run_id=g.run_id AND p1.id=m.player1
 JOIN ptp_solo_ai_participants p2 ON p2.run_id=g.run_id AND p2.id=m.player2 WHERE g.id=$1`,[id])
 return {metadata,examples:trainingExamples(saved.record,saved.recordHash).map(e=>({...e,participantKind:e.seat===0?metadata!.seat0_kind:metadata!.seat1_kind}))}
})}
