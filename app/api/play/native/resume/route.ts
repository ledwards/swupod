import {getSession,requireAlphaAccess} from '@/lib/auth'
import {queryRow} from '@/lib/db'
import {nativeSession,respond,uuid} from '@/src/services/play/native/http'
import {nativeConfig,runtimeStatus,issueLaunch} from '@/src/services/play/native/runtimeClient'
import {localPracticeEnabled,localPracticeMatchId} from '@/src/services/play/native/localPractice'
import {PtpPlayError} from '@/src/services/play/playState'
import {soloBestOfThree} from '@/lib/play/soloEvent'
import {podLaunchOptions} from '@/src/services/pods/podGames'

/** Renew access to an existing seat only; never create or advance a game. */
export async function GET(request:Request){
 try{
  const config=nativeConfig(process.env,true),url=new URL(request.url);
  const match=uuid(url.searchParams.get('match')),seat=Number(url.searchParams.get('seat'));
  if(!['0','1'].includes(url.searchParams.get('seat')??''))throw new PtpPlayError(400,'invalid_seat','Invalid seat.')
  if(!getSession(request)){const login=new URL('/api/auth/signin/discord',config.hostOrigin);login.searchParams.set('return_to',url.pathname+url.search);return Response.redirect(login,303)}
  const user=await nativeSession(request);let returnPath:string;let eventFormat: 'swiss'|'elimination'|undefined;let opponentPath:string|undefined;let bestOfThree=false;
  if(url.searchParams.has('request')){
   const requestId=uuid(url.searchParams.get('request')),opponent=url.searchParams.get('opponent')==='ai'?'ai':'human';
   if(!localPracticeEnabled()||localPracticeMatchId(user.id,requestId,opponent)!==match||(opponent==='ai'&&seat!==0))throw new PtpPlayError(403,'seat_forbidden','This seat does not belong to you.')
   if(opponent==='ai')await requireAlphaAccess(request);
   returnPath=`/play/test?pool=${encodeURIComponent(url.searchParams.get('pool')??'')}&request=${requestId}&opponent=${opponent}`;
  }else{
   const solo=await queryRow(`SELECT r.id,r.prepared,r.pool_share_id,r.request_id,r.best_of_three FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id JOIN ptp_solo_ai_matches m ON m.id=g.match_id WHERE g.id=$1 AND r.owner_user_id=$2 AND m.player1='human' AND g.requested=true`,[match,user.id]);
   if(solo){if(seat!==0)throw new PtpPlayError(403,'seat_forbidden','This seat does not belong to you.');await requireAlphaAccess(request);returnPath=`/runs/${solo.id}`;bestOfThree=soloBestOfThree(solo);const prepared=typeof solo.prepared==='string'?JSON.parse(solo.prepared):solo.prepared;if(!prepared.singleGame)eventFormat=prepared.eventFormat==='elimination'?'elimination':'swiss';else opponentPath=`/pools/${encodeURIComponent(String(solo.pool_share_id))}/play/ai?chooseOpponent=1`;}
   else{const member=await queryRow('SELECT seat FROM ptp_native_match_seats WHERE match_id=$1 AND user_id=$2',[match,user.id]);if(!member||Number(member.seat)!==seat)throw new PtpPlayError(403,'seat_forbidden','This seat does not belong to you.');
    // A pod tournament table resumes as it launched: back to the pod, Bo3 when the match is.
    const pod=await queryRow('SELECT p.share_id,m.stage,m.best_of FROM pod_tournament_games g JOIN pod_tournament_matches m ON m.id=g.match_id JOIN pods p ON p.id=m.pod_id WHERE g.id=$1',[match]);
    if(pod){const options=podLaunchOptions(String(pod.share_id),String(pod.stage),Number(pod.best_of));returnPath=options.returnPath;eventFormat=options.eventFormat;bestOfThree=options.bestOfThree;}
    else returnPath=`/matches/${match}`;}
  }
  await runtimeStatus(config,match);
  const launch=await issueLaunch(config,match,user.id,seat,(user.exp??0)*1000,{isolated:true,returnPath,bestOfThree,...(eventFormat?{eventFormat}:{}),...(opponentPath?{opponentPath}:{})});
  return new Response(null,{status:303,headers:{location:launch.launchUrl,'cache-control':'no-store','referrer-policy':'no-referrer'}});
 }catch(error){return respond(async()=>{throw error})}
}
