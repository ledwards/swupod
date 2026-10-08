import {respond,uuid} from '@/src/services/play/native/http'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {localPracticeEnabled,localPracticeMatchId} from '@/src/services/play/native/localPractice'
import {queryRows} from '@/lib/db'
import {PtpPlayError} from '@/src/services/play/playState'
export function GET(request:Request,context:{params:Promise<{matchId:string}>}) {
 return respond(async()=>{
  authorizeRecordService(request)
  const matchId=uuid((await context.params).matchId),subject=uuid(new URL(request.url).searchParams.get('subject'))
  let rows=await queryRows('SELECT s.seat,s.user_id,u.username,u.avatar_url,u.is_patron FROM ptp_native_match_seats s JOIN users u ON u.id=s.user_id WHERE s.match_id=$1 ORDER BY s.seat',[matchId])
  if(!rows.length){
   const game=await queryRows(`SELECT p.id,p.kind,p.name,r.prepared->'human'->>'poolType' AS pool_type,u.username,u.avatar_url,u.is_patron,
    CASE WHEN p.id=m.player1 THEN 0 ELSE 1 END AS seat FROM ptp_solo_ai_games g
    JOIN ptp_solo_ai_runs r ON r.id=g.run_id JOIN users u ON u.id=r.owner_user_id
    JOIN ptp_solo_ai_matches m ON m.id=g.match_id JOIN ptp_solo_ai_participants p ON p.run_id=r.id AND p.id IN (m.player1,m.player2)
    WHERE g.id=$1 AND r.owner_user_id=$2 ORDER BY seat`,[matchId,subject])
   rows=game.map(p=>({...p,user_id:subject,username:p.kind==='human'?p.username:p.name,avatar_url:p.kind==='human'?p.avatar_url:null,is_patron:p.kind==='human'&&p.is_patron}))
  }
  if(!rows.length){
   const solo=await queryRows('SELECT r.prepared,u.username,u.avatar_url,u.is_patron FROM ptp_solo_ai_runs r JOIN users u ON u.id=r.owner_user_id WHERE r.id=$1 AND r.owner_user_id=$2',[matchId,subject])
   if(solo[0]){const r=solo[0],prepared=typeof r.prepared==='string'?JSON.parse(r.prepared):r.prepared as {bot:{name:string}};rows=[{...r,user_id:subject,seat:0},{user_id:subject,seat:1,username:prepared.bot.name,avatar_url:null,is_patron:false}]}
  }
  const practiceRequest=new URL(request.url).searchParams.get('practiceRequest')
  const ai=new URL(request.url).searchParams.get('practiceOpponent')==='ai'
  if(!rows.length&&practiceRequest&&localPracticeEnabled()&&localPracticeMatchId(subject,uuid(practiceRequest),ai?'ai':'human')===matchId){const user=await queryRows('SELECT id AS user_id,username,avatar_url,is_patron FROM users WHERE id=$1',[subject]);rows=user.flatMap(u=>[0,1].map(seat=>({...u,seat,...(ai&&seat===1?{username:'Baize AI · WIP',avatar_url:null,is_patron:false}: {})})));}
  if(!rows.some(r=>r.user_id===subject))throw new PtpPlayError(403,'not_a_player','Not a player in this game.')
  return {players:rows.map(r=>({seat:Number(r.seat),isAi:r.kind==='ai',poolType:r.pool_type,isPatron:r.is_patron===true,name:String(r.username??'Player'),avatarUrl:typeof r.avatar_url==='string'&&!r.avatar_url.includes('/embed/avatars/')&&/^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(r.avatar_url)?r.avatar_url:null}))}
 })
}
