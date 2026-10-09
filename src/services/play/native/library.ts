import {queryRow} from '../../../../lib/db'
import {PtpPlayError,summarizeDeckBuilderState} from '../playState'
import {nativeConfig} from './runtimeClient'

/** An owned library read, independent of whether the pool can enter a game. */
export async function ownedPool(userId:string,shareId:string){
 const row=await queryRow('SELECT share_id,set_code,set_name,pool_type,name,cards,deck_builder_state,created_at,updated_at FROM card_pools WHERE user_id=$1 AND share_id=$2 AND hidden IS NOT TRUE',[userId,shareId])
 if(!row)throw new PtpPlayError(404,'pool_not_found','Pool not found.')
 const parse=(value:unknown)=>typeof value==='string'?JSON.parse(value):value
 const deckBuilderState=parse(row.deck_builder_state),cards=parse(row.cards)
 const {hostOrigin}=nativeConfig(process.env,true)
 const {ready:buildComplete,blocker:buildBlocker,...summary}=summarizeDeckBuilderState({shareId:String(row.share_id),setCode:String(row.set_code),setName:row.set_name==null?null:String(row.set_name),name:row.name==null?null:String(row.name),poolType:String(row.pool_type),deckBuilderState,createdAt:row.created_at as Date|null,updatedAt:row.updated_at as Date|null})
 return {pool:{...summary,buildComplete,buildBlocker,cards:Array.isArray(cards)?cards:[],deckBuilderState,hasDeck:deckBuilderState!=null,poolUrl:`${hostOrigin}/pool/${encodeURIComponent(shareId)}`,editUrl:`${hostOrigin}/pool/${encodeURIComponent(shareId)}/deck`}}
}
