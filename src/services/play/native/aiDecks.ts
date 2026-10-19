import catalogue from '../../../../data/ai-decks.json'
import {validateConstructed,type ConstructedDeck,type LegalityCard} from '../constructedValidation'
import {PtpPlayError} from '../playState'
import type {QueueContract} from '../formats'
import type {loadSupport} from './savedDeck'
import {practiceDeck} from './localPractice'
import {constructBotDeck} from '../../../utils/botDeckConstruction'
import {getBaseSetCode} from '../../../utils/carboniteConstants'
import {SET_CONFIGS,isReleased} from '../../../utils/setConfigs'
import type {NativeDeckVersion} from '../deckVersions'
import {buildPackWarsDeckVersion,chooseAiPackWarsPair,unsupportedPackWarsCards,type PackWarsCard} from '../packWarsDeck'

type Support=Awaited<ReturnType<typeof loadSupport>>
type Format='premier'|'eternal'
/** Leebo keeps 20 decks per format: one strong list of each of the format's 20 most-played archetypes. */
export type AiDeckFormat=Format|'draft'|'sealed'
export interface AiDeckEntry {id:string;name:string;format:AiDeckFormat;rank:number;set?:string;archetype?:string;leader:string;base:string;deck:{id:string;count:number}[];sideboard:{id:string;count:number}[];source:{kind:string;label:string;event?:string;placement?:number;date?:string}}
export interface AiDeckOption {id:string;name:string;leader:string;base:string;formats:AiDeckFormat[];set?:string}
/** The same legality options a player's deck is checked with. */
export const legality=(now:Date)=>({now,homeworldsReleased:isReleased((SET_CONFIGS as Record<string,any>).HMW,now)})
export const AI_DECKS=(catalogue as {decks:AiDeckEntry[]}).decks

/** The deck if it is legal in this format today and every card is engine supported; otherwise null. */
export function checkAiDeck(entry:Pick<AiDeckEntry,'leader'|'base'|'deck'|'sideboard'>,format:Format,catalog:LegalityCard[],supported:ReadonlySet<string>,options:{now?:Date;homeworldsReleased?:boolean}={}):ConstructedDeck|null{
 try{
  const deck=validateConstructed({leader:entry.leader,base:entry.base,deck:entry.deck,sideboard:entry.sideboard},format,catalog,options)
  return [deck.leader,deck.base,...deck.cards.map(c=>c.id),...deck.sideboard.map(c=>c.id)].every(id=>supported.has(id))?deck:null
 }catch(e){if(e instanceof PtpPlayError)return null;throw e}
}

// Legality only changes with the day's policy and the engine's support list.
const memo=new Map<string,{at:number;list:AiDeckOption[]}>()
/** Leebo's decks that are playable right now, each under its own format, most-played archetype first. */
export function aiDeckOptions(key:string,catalog:()=>LegalityCard[],supported:ReadonlySet<string>,options:{now?:Date;homeworldsReleased?:boolean}={}):AiDeckOption[]{
 const hit=memo.get(key),at=Date.now()
 if(hit&&at-hit.at<600000)return hit.list
 const cards=catalog()
 const playable=(d:AiDeckEntry)=>d.format==='draft'||d.format==='sealed'?limitedSupported(d,supported):!!checkAiDeck(d,d.format,cards,supported,options)
 const list=AI_DECKS.filter(playable).map(d=>({id:d.id,name:d.name,leader:d.leader,base:d.base,formats:[d.format],...(d.set?{set:d.set}:{})}))
 if(memo.size>8)memo.clear()
 memo.set(key,{at,list});return list
}
const limitedSupported=(d:Pick<AiDeckEntry,'leader'|'base'|'deck'>,supported:ReadonlySet<string>)=>d.deck.reduce((n,c)=>n+c.count,0)>=30&&[d.leader,d.base,...d.deck.map(c=>c.id)].every(id=>supported.has(id))
/** Resolve a catalogue id for this format; the result passes the same checks as a player's deck. */
export function aiDeck(id:unknown,format:Format,catalog:LegalityCard[],supported:ReadonlySet<string>,options:{now?:Date;homeworldsReleased?:boolean}={}):ConstructedDeck{
 const entry=typeof id==='string'?AI_DECKS.find(d=>d.id===id):undefined
 if(!entry)throw new PtpPlayError(404,'ai_deck_not_found','Choose one of Leebo’s decks.')
 const deck=entry.format===format?checkAiDeck(entry,format,catalog,supported,options):null
 if(!deck)throw new PtpPlayError(409,'ai_deck_unavailable','That deck is not playable in this format right now.')
 return deck
}

/**
 * One of Leebo's saved Draft or Sealed decks for this contract: a Draft deck for Draft, a Sealed
 * deck for six- or eight-pack Sealed, either for Chaos; the deck's set must be the contract's.
 */
export function aiLimitedDeck(id:unknown,contract:Pick<QueueContract,'format'|'limited'|'set'>,supported:ReadonlySet<string>):{leader:string;base:string;cards:readonly {id:string;count:number}[]}{
 const entry=typeof id==='string'?AI_DECKS.find(d=>d.id===id):undefined
 if(!entry||(entry.format!=='draft'&&entry.format!=='sealed'))throw new PtpPlayError(404,'ai_deck_not_found','Choose one of Leebo’s decks.')
 const kind=contract.limited==='draft'?'draft':contract.limited==='chaos'?entry.format:'sealed'
 if(contract.format!=='limited'||entry.format!==kind||(contract.limited!=='chaos'&&entry.set!==contract.set)||!limitedSupported(entry,supported))
  throw new PtpPlayError(409,'ai_deck_unavailable','That deck is not playable in this format right now.')
 return {leader:entry.leader,base:entry.base,cards:entry.deck}
}

/**
 * Leebo opens his own pool of the contract's set and builds with the draft-bot builder.
 * Sealed opens the contract's pack count; Draft and Chaos open six packs, since a solo
 * pick-by-pick draft cannot run inside a game request. Only engine-supported cards enter the pool.
 */
export async function leeboPoolDeck(contract:Pick<QueueContract,'format'|'limited'|'set'>,playerSet:string,support:Support,open?:(set:string,packs:number)=>{cards:Record<string,unknown>[]}[]):Promise<{leader:string;base:string;cards:readonly {id:string;count:number}[];setCode:string;packCount:number}>{
 if(contract.format!=='limited')throw new PtpPlayError(400,'invalid_opponent','Leebo’s pool is for Draft and Sealed.')
 const setCode=(contract.limited==='chaos'?playerSet.split(',')[0]:contract.set)||playerSet.split(',')[0]!
 if(!support.policy.supportedSets.has(getBaseSetCode(setCode)))throw new PtpPlayError(409,'unsupported_set','This set is not supported yet.')
 const packCount=contract.limited==='eight'?8:6
 if(!open){const {initializeCardCache}=await import('../../../utils/cardCache');const {generateSealedPod}=await import('../../../utils/boosterPack');await initializeCardCache();open=(s,n)=>generateSealedPod([],s,n) as unknown as {cards:Record<string,unknown>[]}[]}
 const supported=(c:Record<string,unknown>)=>{const found=typeof c.id==='string'?support.catalog.get(c.id):undefined;return !!found&&support.policy.supportedCardIds.has(found.engineId)}
 const cards=open(setCode,packCount).flatMap(p=>p.cards).filter(supported)
 const built=constructBotDeck({drafted_leaders:cards.filter(c=>c.isLeader||c.type==='Leader'),drafted_cards:cards.filter(c=>!(c.isLeader||c.type==='Leader')),strategy_name:'allPlayer',mixin_name:'highConviction'},getBaseSetCode(setCode))
 if(!built)throw new PtpPlayError(409,'bot_deck_unavailable','Leebo could not build a deck from his pool. Try again.')
 const deck=practiceDeck(built.deckBuilderState,support)
 return {leader:deck.leader,base:deck.base,cards:deck.deck,setCode,packCount}
}

/**
 * Pack Wars: Leebo opens his own packs of the player's set, the same way the player's
 * were opened, and plays all of them. He keeps the leader and base that leave the fewest
 * aspect icons uncovered. Cards the engine can't play yet stay in the wrapper.
 */
export async function leeboPackWarsDeck(input:{setCode:string;packCount:number;participantId:string;ownerUserId:string},support:Support,open?:(set:string)=>{cards:Record<string,unknown>[]}):Promise<{snapshot:NativeDeckVersion;cards:PackWarsCard[]}>{
 if(!support.policy.supportedSets.has(input.setCode))throw new PtpPlayError(409,'unsupported_set','This set is not supported yet.')
 if(!open){const {initializeCardCache}=await import('../../../utils/cardCache');const {generateBoosterPack}=await import('../../../utils/boosterPack');await initializeCardCache();open=s=>generateBoosterPack([],s) as unknown as {cards:Record<string,unknown>[]}}
 const opened=Array.from({length:input.packCount},()=>open!(input.setCode).cards).flat() as PackWarsCard[]
 const cards=opened.filter(c=>typeof c.id==='string'&&unsupportedPackWarsCards([c],support).length===0)
 const choice=chooseAiPackWarsPair(cards,c=>support.catalog.get(c.id)?.type)
 if(!choice)throw new PtpPlayError(409,'bot_deck_unavailable','Leebo could not open a playable leader and base. Try again.')
 const snapshot=buildPackWarsDeckVersion({authenticatedUserId:input.ownerUserId,pool:{id:input.participantId,shareId:input.participantId,userId:input.ownerUserId},evidence:{sourcePoolId:input.participantId,setCode:input.setCode,packCount:input.packCount,cards},choice,...support})
 return {snapshot,cards}
}
