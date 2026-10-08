import {queryRow,withTransaction} from '@/lib/db'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {body,respond,text,uuid} from '@/src/services/play/native/http'
import {nativeDecks} from '@/src/services/play/native/decks'
import {freezeSavedDeck,loadSupport} from '@/src/services/play/native/savedDeck'
import {nativeConfig} from '@/src/services/play/native/runtimeClient'
import {PtpPlayError} from '@/src/services/play/playState'

async function player(request:Request){
 authorizeRecordService(request)
 const subject=uuid(new URL(request.url).searchParams.get('subject'))
 const user=await queryRow('SELECT is_admin,is_alpha_tester FROM users WHERE id=$1',[subject])
 if(!user||(!user.is_admin&&!user.is_alpha_tester))throw new PtpPlayError(403,'play_unavailable','Play is not available for this account.')
 return subject
}
export function GET(request:Request){return respond(async()=>{
 const subject=await player(request),result=await nativeDecks(subject)
 return {decks:result.decks.map(({poolShareId,name,leaderName,baseName,leaderImageUrl,setCode,setName,poolType,packCount,mainDeckCount,ready,blocker})=>({poolShareId,name,leaderName,baseName,leaderImageUrl,setCode,setName,poolType,packCount,mainDeckCount,ready,blocker})),hiddenCount:result.hiddenCount}
})}
export function POST(request:Request){return respond(async()=>{
 const subject=await player(request),input=await body(request),poolShareId=text(input.poolShareId,'Saved deck')
 const config=nativeConfig(),support=await loadSupport(config.supportPath)
 if(input.engineRevision!==support.engineRevision&&!support.compatibleRevisions.includes(String(input.engineRevision)))throw new PtpPlayError(409,'rules_changed','Deck support is being updated. Try again shortly.')
 const {id,snapshot}=await withTransaction(tx=>freezeSavedDeck(tx,subject,poolShareId,config.supportPath))
 return {versionId:id,ownerUserId:subject,poolShareId,engineRevision:input.engineRevision,contentHash:snapshot.contentHash,limited:{setCode:snapshot.setCode,poolType:snapshot.poolType,packCount:snapshot.packCount},deck:{leader:snapshot.leader,base:snapshot.base,cards:snapshot.deck}}
})}
