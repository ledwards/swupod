import {queryRow,queryRows} from '../db'
import {matchScore,soloStandings,type SoloParticipant,type SoloMatch,type SoloResult} from '../../src/services/play/solo/progression'
import {reconcileSoloGames} from './soloRecords'
export async function soloStatus(userId:string,pool:string,request?:string){
 const run=await queryRow(`SELECT id,request_id,pool_share_id FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND pool_share_id=$2
 AND ($3::uuid IS NULL OR request_id=$3) ORDER BY created_at DESC LIMIT 1`,[userId,pool,request??null])
 if(!run){
  const source=await queryRow(`SELECT p.user_id FROM card_pools p WHERE p.share_id=$1`,[pool])
  const unavailableReason=!source?'Saved deck not found.':source.user_id===null?'Sign in to save this pool to your account.':source.user_id!==userId?'This deck belongs to another account.':null
  return {run:null,unavailableReason}
 }
 await reconcileSoloGames(String(run.id))
 const participants=await queryRows('SELECT id,seat,kind,name FROM ptp_solo_ai_participants WHERE run_id=$1 ORDER BY seat',[run.id]) as SoloParticipant[]
 const matches=await queryRows('SELECT id,round,player1,player2,winner FROM ptp_solo_ai_matches WHERE run_id=$1 ORDER BY round,ordinal',[run.id]) as SoloMatch[]
 const games=await queryRows('SELECT id,match_id,game_no,requested,result,error FROM ptp_solo_ai_games WHERE run_id=$1 ORDER BY game_no',[run.id])
 const rounds=participants.length===8?3:1,round=matches.length?Math.max(...matches.map(m=>m.round)):1
 const complete=matches.length>0&&round===rounds&&matches.every(m=>m.winner)
 const current=games.find(g=>!g.result&&matches.some(m=>m.id===g.match_id&&m.player1==='human'&&!m.winner))
 return {run:{id:String(run.id),requestId:String(run.request_id),poolShareId:String(run.pool_share_id),round,rounds,complete,
  preparing:participants.length===0,currentGame:current?{id:String(current.id),number:Number(current.game_no),started:current.requested===true}:null,
  standings:soloStandings(participants,matches),matches:matches.map(m=>{
   const list=games.filter(g=>g.match_id===m.id),score=matchScore(list.flatMap(g=>g.result?[g.result as SoloResult]:[]))
   return {id:m.id,round:m.round,players:[m.player1,m.player2].map(id=>({id,name:participants.find(p=>p.id===id)?.name??'Opponent'})),wins:score.wins,winner:m.winner,
    games:list.map(g=>({id:String(g.id),number:Number(g.game_no),result:g.result as SoloResult|null,started:g.requested===true,error:g.error as string|null})),
    stalled:!m.winner&&list.length>=20&&list.every(g=>g.result)}
  })}}
}
export type SoloStatus=Awaited<ReturnType<typeof soloStatus>>
