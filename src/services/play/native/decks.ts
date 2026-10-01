import { withTransaction } from '../../../../lib/db'
import { PtpPlayError, summarizeDeckBuilderState } from '../playState'
import { NativeDeckEligibilityError } from '../deckVersions'
import { nativeConfig } from './runtimeClient'
import { loadSupport, validateSavedDeck } from './savedDeck'
/** Read-only eligibility: the same authoritative validation as admission, no snapshot insert. */
export async function nativeDecks(userId:string,requestedPool?:string) {
  const config=nativeConfig(process.env,true)
  const support=await loadSupport(config.supportPath)
  return withTransaction(async tx=>{
    const pools=await tx.queryRows("SELECT * FROM card_pools WHERE user_id=$1 AND (pool_type IN ('sealed','draft') OR share_id=$2) AND deck_builder_state IS NOT NULL ORDER BY (share_id=$2) DESC NULLS LAST,updated_at DESC NULLS LAST LIMIT 100",[userId,requestedPool??null])
    const decks=[]
    for(const row of pools){
      const summary=summarizeDeckBuilderState({shareId:String(row.share_id),setCode:String(row.set_code),setName:row.set_name as string|null,poolType:String(row.pool_type),name:row.name as string|null,deckBuilderState:row.deck_builder_state,createdAt:row.created_at as Date,updatedAt:row.updated_at as Date})
      try {
        if(!['sealed','draft'].includes(String(row.pool_type)))throw new PtpPlayError(409,'unsupported_format','Native play currently supports draft and sealed decks. This format is not supported yet.')
        const {snapshot}=await validateSavedDeck(tx,userId,summary.poolShareId,config.supportPath,false,support)
        decks.push({...summary,ready:true,blocker:null,blockerCode:null,setCode:snapshot.setCode,poolType:snapshot.poolType,packCount:snapshot.packCount})
      }catch(error){
        if(!(error instanceof NativeDeckEligibilityError || error instanceof PtpPlayError))throw error
        decks.push({...summary,ready:false,blocker:error.message,blockerCode:error.code,packCount:null})
      }
    }
    return {decks}
  })
}
