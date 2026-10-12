import {ownedPool} from './library'
import {queryRow,queryRows,withTransaction} from '../../../../lib/db'
import {SET_CONFIGS,isCurrentPoolSet} from '../../../utils/setConfigs'
import {queueContract,limitedCompatible,contractKey,contractLabel} from '../formats'
import {validateConstructed,toEngineDeck,engineIdLookup} from '../constructedValidation'
import {cardCatalog,currentPolicy,currentPoolSets} from '../cardPool'
import {PtpPlayError} from '../playState'
import {nativeDecks} from './decks'
import {freezeSavedDeck,loadSupport} from './savedDeck'
import {nativeConfig} from './runtimeClient'
import {sharedRemote} from './sharedRemote'
import {uuid,text} from './http'
import {aiDeck,aiDeckOptions,leeboPoolDeck,legality} from './aiDecks'

export async function sharedIdentity(id:string){
 const row=await queryRow('SELECT id,username,is_admin,is_beta_tester FROM users WHERE id=$1',[id])
 if(!row||(!row.is_admin&&!row.is_beta_tester))throw new PtpPlayError(403,'beta_required','Play is available to beta players.')
 return {id:String(row.id),name:String(row.username)}
}
export async function sharedPlay(subject:string|null,input:Record<string,any>,expiresAt=Date.now()+3600000) {
 const now=new Date()
 const action=input.action??'state',config=nativeConfig(process.env,true)
 if(action==='state'){
  const [remote,pods]=await Promise.all([sharedRemote(subject??'public','state'),queryRows("SELECT share_id,name,set_code,current_players,max_players FROM pods WHERE is_public=true AND status='waiting' AND pod_type='draft' AND created_at>NOW()-INTERVAL '2 hours' ORDER BY created_at DESC LIMIT 20")])
  const sets=currentPoolSets(now).map(c=>({code:c.setCode,name:c.setName}))
  // Leebo's own decks: never fatal to the lobby state.
  const aiDecks=await loadSupport(config.supportPath).then(support=>aiDeckOptions(`${currentPolicy(now)}:${support.policy.version}`,()=>cardCatalog(now),support.policy.supportedCardIds,legality(now))).catch(()=>[])
  return {...remote,aiDecks,currentPolicy:currentPolicy(now),sets,pools:[{id:'current',name:'Current'}],ptpOrigin:config.hostOrigin,playOrigin:config.publicOrigin,pods:pods.map(p=>({id:p.share_id,name:p.name||`${p.set_code} draft`,set:p.set_code,players:p.current_players,capacity:p.max_players})),signedIn:!!subject}
 }
 // An invitation is readable by a signed-in player holding its link; signed out, the landing only asks them to log in.
 if(action==='invite'){if(!subject)throw new PtpPlayError(401,'unauthorized','Sign in to play.');return sharedRemote(subject,'invite',{invite:typeof input.invite==='string'?input.invite.slice(0,200):''})}
 if(!subject)throw new PtpPlayError(401,'unauthorized','Sign in to play.')
 const user=await sharedIdentity(subject)
 if(action==='pool')return ownedPool(subject,text(input.poolShareId,'Pool'))
 if(action==='decks'||action==='library')return nativeDecks(subject,typeof input.poolShareId==='string'?input.poolShareId:undefined,{includeUnplayable:true,requestedOnly:input.requestedOnly===true,byPool:input.byPool===true,hideUnverified:input.byPool!==true})
 if(['cancel','launch'].includes(action))return sharedRemote(subject,action,{matchId:input.matchId,expiresAt,returnUrl:`${config.hostOrigin}/play`})
 if(!['play','validate','export'].includes(action))throw new PtpPlayError(400,'invalid_action','Unknown play action.')
 const contract={...queueContract(input.contract??{}),policy:currentPolicy(now)}
 if(action==='play'&&!['queue','private','ai'].includes(input.mode))throw new PtpPlayError(400,'invalid_mode','Choose how to play.')
 const requestId=action==='play'?uuid(input.requestId):undefined
 return withTransaction(async tx=>{
  // One lock shared with existing native/legacy admission. Keep the remote
  // reservation inside it; a lost response is retried under the same request ID.
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))',[`ptp-play-user:${subject}`])
  if(action==='play'){
   const active=await tx.queryRow(`SELECT 1 FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL
    UNION ALL SELECT 1 FROM ptp_play_matches WHERE (player1_user_id=$1 OR player2_user_id=$1) AND status IN ('matched','launch_ready','in_progress')
    UNION ALL SELECT 1 FROM ptp_play_queue_entries WHERE user_id=$1 AND status='queued' AND expires_at>NOW() LIMIT 1`,[subject])
   if(active)throw new PtpPlayError(409,'already_playing','Finish or cancel your existing PTP table first.')
  }
  let deck:{leader:string;base:string;cards:readonly {id:string;count:number}[];sideboard?:{id:string;count:number}[]}|undefined,provenance:unknown=null
  if(contract.format==='limited'){
   const frozen=await freezeSavedDeck(tx,subject,text(input.poolShareId,'Saved deck'),config.supportPath)
   if(!limitedCompatible(contract,frozen.snapshot))throw new PtpPlayError(409,'format_mismatch','Choose a deck with the same set, limited format, and pack count, or select Chaos.')
   const sets=frozen.snapshot.setCode.split(',').map(code=>(SET_CONFIGS as Record<string,any>)[code])
   if(sets.some(set=>!set||!isCurrentPoolSet(set,now)))throw new PtpPlayError(409,'preview_unavailable','This deck needs a Next Set practice pool, which is not available yet.')
   deck={leader:frozen.snapshot.leader,base:frozen.snapshot.base,cards:frozen.snapshot.deck,sideboard:[...(frozen.snapshot.sideboard??[])]}
   provenance={versionId:frozen.id,...frozen.snapshot}
  }
  const support=await loadSupport(config.supportPath)
  // Constructed: legal by card identity, then each printing (Hyperspace, Showcase, foil) mapped to the engine's own ID.
  if(contract.format!=='limited'){const catalog=cardCatalog(now);deck=toEngineDeck(validateConstructed(input.deck,contract.format,catalog,legality(now)),engineIdLookup(catalog,id=>support.catalog.get(id)?.engineId))}
  const supported=(d:NonNullable<typeof deck>,sideboard:boolean)=>{for(const id of [d.leader,d.base,...d.cards.map(c=>c.id),...(sideboard?d.sideboard??[]:[]).map(c=>c.id)])if(!support.policy.supportedCardIds.has(id))throw new PtpPlayError(409,'unsupported_card',`${id} is legal but not supported by this game engine yet.`)}
  if(!deck)throw new PtpPlayError(409,'invalid_deck','Import a deck JSON object.')
  supported(deck,contract.format!=='limited')
  if(action!=='play')return {valid:true,contract,deck:{leader:{id:deck.leader,count:1},base:{id:deck.base,count:1},deck:deck.cards,sideboard:deck.sideboard??[]}}
  const opponent=input.mode==='ai'?await resolveOpponent(input,contract,(provenance as {setCode?:string}|null)?.setCode??'',support,now,id=>freezeSavedDeck(tx,subject,id,config.supportPath)):undefined
  return sharedRemote(subject,'play',{requestId,mode:input.mode,invite:input.invite,anonymous:input.anonymous===true,name:user.name,deck,...(opponent?{opponentDeck:{leader:opponent.leader,base:opponent.base,cards:opponent.cards}}:{}),provenance,contract,queueKey:contractKey(contract),format:contractLabel(contract),revision:support.engineRevision})
 })
}

type Deck={leader:string;base:string;cards:readonly {id:string;count:number}[]}
/**
 * Leebo's deck for a vs AI game: one of his catalogue decks (`opponentPreset`), his own
 * freshly opened pool (`opponentPool:'leebo'`), or one of the player's decks (`opponentDeck`,
 * `opponentPoolShareId`, ownership checked by the freeze). Nothing named means a mirror.
 * Every choice passes the same legality and engine-support checks as the player's deck.
 */
export async function resolveOpponent(input:Record<string,any>,contract:ReturnType<typeof queueContract>,playerSet:string,support:Awaited<ReturnType<typeof loadSupport>>,now:Date,freeze:(shareId:string)=>Promise<{snapshot:{leader:string;base:string;deck:readonly {id:string;count:number}[];setCode:string;poolType:string;packCount:number}}>):Promise<Deck|undefined>{
 const ids=support.policy.supportedCardIds
 if(contract.format==='limited'){
  if(input.opponentPool!==undefined){
   if(input.opponentPool!=='leebo')throw new PtpPlayError(400,'invalid_opponent','Choose Leebo’s pool or one of your decks.')
   return leeboPoolDeck(contract,playerSet,support)
  }
  if(input.opponentPoolShareId===undefined)return undefined
  const other=await freeze(text(input.opponentPoolShareId,'Opponent deck'))
  if(!limitedCompatible(contract,other.snapshot))throw new PtpPlayError(409,'opponent_format','Choose an opponent deck with the same set and limited format.')
  return {leader:other.snapshot.leader,base:other.snapshot.base,cards:other.snapshot.deck}
 }
 if(input.opponentPreset!==undefined)return aiDeck(input.opponentPreset,contract.format,cardCatalog(now),ids,legality(now))
 if(input.opponentDeck===undefined)return undefined
 const catalog=cardCatalog(now)
 const deck=toEngineDeck(validateConstructed(input.opponentDeck,contract.format,catalog,legality(now)),engineIdLookup(catalog,id=>support.catalog.get(id)?.engineId))
 for(const id of [deck.leader,deck.base,...deck.cards.map(c=>c.id)])if(!ids.has(id))throw new PtpPlayError(409,'unsupported_card',`${id} is legal but not supported by this game engine yet.`)
 return deck
}
