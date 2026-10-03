import {withTransaction} from './db'
import {PtpPlayError} from '../src/services/play/playState'

/** The share link grants access to an anonymous pool; serialize competing claims. */
export async function claimAnonymousPool(shareId:string,userId:string){
 return withTransaction(async tx=>{
  const selected=await tx.queryRow('SELECT id,parent_pool_id FROM card_pools WHERE share_id=$1',[shareId])
  if(!selected)throw new PtpPlayError(404,'pool_not_found','Pool not found')
  const root=await tx.queryRow('SELECT id,user_id FROM card_pools WHERE id=$1 FOR UPDATE',[selected.parent_pool_id??selected.id])
  const deck=selected.parent_pool_id?await tx.queryRow('SELECT id,user_id FROM card_pools WHERE id=$1 FOR UPDATE',[selected.id]):root
  if(!root||!deck)throw new PtpPlayError(404,'pool_not_found','Pool not found')
  if([root,deck].some(p=>p.user_id!==null&&p.user_id!==userId))throw new PtpPlayError(403,'not_owner','Pool is already owned by another user')
  const claimed=root.user_id===null||deck.user_id===null
  await tx.query('UPDATE card_pools SET user_id=$1,updated_at=NOW() WHERE id=ANY($2::uuid[]) AND user_id IS NULL',[userId,[root.id,deck.id]])
  return {claimed,alreadyOwned:!claimed}
 })
}
