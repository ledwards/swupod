import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {body,uuid} from '@/src/services/play/native/http'
import {queryRow} from '@/lib/db'
import {callMeleeRewardLink} from '@/lib/meleeRewardLink'
export async function POST(request:Request){
 try{
  authorizeRecordService(request)
  const input=await body(request);const subject=uuid(input.subject)
  if(!['status','begin','verify','disconnect','erase'].includes(String(input.action)))return Response.json({error:'Unknown connection action.'},{status:400})
  const discordId=(await queryRow('SELECT discord_id FROM users WHERE id=$1',[subject]))?.discord_id
  if(typeof discordId!=='string'||!/^\d{17,20}$/.test(discordId))return Response.json({error:'Sign in with Discord to connect Melee.'},{status:401})
  const result=await callMeleeRewardLink(discordId,{action:input.action,handle:input.handle,challengeId:input.challengeId,noticeVersion:input.noticeVersion})
  return Response.json(result.data,{status:result.status,headers:{'Cache-Control':'no-store'}})
 }catch(error){const status=typeof error==='object'&&error&&'status' in error?Number(error.status):503;return Response.json({error:status===401?'Unauthorized':'Could not check your Melee connection. Try again.'},{status})}
}
