import {queryRow,queryRows} from '../db'
import {reconcileSoloGames} from './soloRecords'
import {convertSoloToBo3,getSoloSideboard,continueSoloSideboard} from './soloSideboard'
import {PtpPlayError} from '../../src/services/play/playState'

/** The gateway supplies the authenticated player and finished game, never a client-selected run. */
export async function inGameSideboard(gameId:string,subject:string,input:{action:string;gameId?:string;selection?:unknown;buildShareId?:string;expiresAt:number}) {
 const owned=await queryRow(`SELECT g.run_id,g.match_id FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id
  JOIN ptp_solo_ai_matches m ON m.id=g.match_id WHERE g.id=$1 AND r.owner_user_id=$2 AND m.player1='human'`,[gameId,subject])
 if(!owned)throw new PtpPlayError(404,'game_not_found','Game not found.')
 const runId=String(owned.run_id)
 await reconcileSoloGames(runId)
 const finished=await queryRow('SELECT result,error FROM ptp_solo_ai_games WHERE id=$1',[gameId])
 if(!finished?.result&&finished?.error)throw new PtpPlayError(503,'archive_pending','Unable to prepare sideboard. Try again later.')
 if(!finished?.result)return {state:'recording'}
 if(input.action==='convert')await convertSoloToBo3(runId,subject)
 const match=await queryRow('SELECT winner,round,(SELECT COUNT(*) FROM ptp_solo_ai_participants WHERE run_id=ptp_solo_ai_matches.run_id) AS participants FROM ptp_solo_ai_matches WHERE id=$1',[owned.match_id])
 const results=await queryRows('SELECT result FROM ptp_solo_ai_games WHERE match_id=$1 AND result IS NOT NULL',[owned.match_id])
 const score=[results.filter(g=>g.result==='player1').length,results.filter(g=>g.result==='player2').length]
 if(match?.winner)return {state:'complete',score,nextRound:Number(match.round)<(Number(match.participants)===8?3:1)?Number(match.round)+1:null}
 const data=await getSoloSideboard(runId,subject)
 const next=await queryRow('SELECT match_id FROM ptp_solo_ai_games WHERE id=$1',[data.gameId])
 if(String(next?.match_id)!==String(owned.match_id))throw new PtpPlayError(409,'match_changed','This match is complete.')
 if(input.action==='ready') {
  if(input.gameId!==data.gameId)throw new PtpPlayError(409,'stale_game','The match has moved on. Reopen sideboarding.')
  const launch=await continueSoloSideboard(runId,data.gameId,subject,input.expiresAt,input.selection,input.buildShareId)
  return {state:'launch',launchUrl:launch.launchUrl}
 }
 return {state:'sideboarding',...data,score,opponentReady:true}
}
