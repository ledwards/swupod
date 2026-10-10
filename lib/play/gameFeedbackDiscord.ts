import {createHash} from 'node:crypto'
import {queryRow,queryRows} from '../db'

export const FEEDBACK_CHANNEL_ID='1557629344975691858'
type Feedback={id:string;note:string;match_id:string;step:number}
export function feedbackMessage(note:Feedback){
 return {
  allowed_mentions:{parse:[]},
  nonce:createHash('sha256').update(note.id).digest('hex').slice(0,24),enforce_nonce:true,
  embeds:[{title:'Game feedback',description:note.note,
   fields:[{name:'Game',value:note.match_id},{name:'Step',value:String(note.step),inline:true}],
   url:`https://protectthepod.com/api/admin/game-notes?id=${encodeURIComponent(note.id)}`,
   footer:{text:`Feedback ${note.id}`}}],
 }
}
/** Saved notes are the outbox. A lease prevents concurrent requests posting the same note. */
export async function deliverGameFeedback(id:string){
 const token=process.env.DISCORD_BOT_TOKEN;
 if(!token)return;
 const note=await queryRow(`UPDATE ptp_game_notes SET discord_retry_at=NOW()+INTERVAL '5 minutes'
 WHERE id=$1 AND discord_message_id IS NULL AND discord_retry_at<=NOW()
 RETURNING id,note,match_id,step`,[id]) as Feedback|null;
 if(!note)return;
 try{
  const response=await fetch(`https://discord.com/api/v10/channels/${FEEDBACK_CHANNEL_ID}/messages`,{
   method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},
   body:JSON.stringify(feedbackMessage(note)),signal:AbortSignal.timeout(10000),
  });
  if(!response.ok){console.warn('Game feedback Discord delivery deferred',{id,status:response.status});return;}
  const message=await response.json();
  if(typeof message.id!=='string')throw Error('Missing Discord message ID');
  await queryRow('UPDATE ptp_game_notes SET discord_message_id=$2 WHERE id=$1 RETURNING id',[id,message.id]);
 }catch{console.warn('Game feedback Discord delivery deferred',{id});}
}
export async function deliverPendingGameFeedback(){
 if(!process.env.DISCORD_BOT_TOKEN)return;
 const pending=await queryRows('SELECT id FROM ptp_game_notes WHERE discord_message_id IS NULL AND discord_retry_at<=NOW() ORDER BY discord_retry_at LIMIT 20');
 for(const note of pending)await deliverGameFeedback(String(note.id));
}
