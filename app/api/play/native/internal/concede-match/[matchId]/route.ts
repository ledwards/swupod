import {respond,uuid,body} from '@/src/services/play/native/http'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {withTransaction} from '@/lib/db'
import {PtpPlayError} from '@/src/services/play/playState'
export function POST(request:Request,context:{params:Promise<{matchId:string}>}){
 return respond(async()=>{
  authorizeRecordService(request)
  const gameId=uuid((await context.params).matchId),input=await body(request),subject=uuid(input.subject)
  return withTransaction(async tx=>{
   const run=await tx.queryRow(`SELECT r.* FROM ptp_solo_ai_runs r JOIN ptp_solo_ai_games g ON g.run_id=r.id
    WHERE g.id=$1 AND r.owner_user_id=$2 FOR UPDATE OF r`,[gameId,subject])
   if(!run)throw new PtpPlayError(404,'game_not_found','Game not found.')
   const prepared=typeof run.prepared==='string'?JSON.parse(run.prepared):run.prepared
   if(!run.best_of_three&&prepared?.singleGame)throw new PtpPlayError(409,'series_required','A best-of-three match is required.')
   const match=await tx.queryRow(`SELECT m.* FROM ptp_solo_ai_matches m JOIN ptp_solo_ai_games g ON g.match_id=m.id
    WHERE g.id=$1 AND (m.player1='human' OR m.player2='human') FOR UPDATE OF m`,[gameId])
   if(!match)throw new PtpPlayError(403,'not_a_player','Not a player in this match.')
   // Preserve completed results; repeat requests cannot alter the winner.
   await tx.query('UPDATE ptp_solo_ai_matches SET winner=$2 WHERE id=$1 AND winner IS NULL',[match.id,match.player1==='human'?match.player2:match.player1])
   return {ok:true}
  })
 })
}
