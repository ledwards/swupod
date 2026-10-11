import catalogue from '../../../../data/ai-decks.json'
import {validateConstructed,type ConstructedDeck,type LegalityCard} from '../constructedValidation'
import {PtpPlayError} from '../playState'
import type {QueueContract} from '../formats'
import type {loadSupport} from './savedDeck'
import {practiceDeck} from './localPractice'
import {constructBotDeck} from '../../../utils/botDeckConstruction'
import {getBaseSetCode} from '../../../utils/carboniteConstants'
import {SET_CONFIGS,isReleased} from '../../../utils/setConfigs'

type Support=Awaited<ReturnType<typeof loadSupport>>
type Format='premier'|'eternal'
export interface AiDeckEntry {id:string;name:string;leader:string;base:string;deck:{id:string;count:number}[];sideboard:{id:string;count:number}[];source:{kind:string;label:string;event?:string;placement?:number;date?:string}}
export interface AiDeckOption {id:string;name:string;leader:string;base:string;formats:Format[]}
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
/** Leebo's constructed decks that are playable right now, strongest first. */
export function aiDeckOptions(key:string,catalog:()=>LegalityCard[],supported:ReadonlySet<string>,options:{now?:Date;homeworldsReleased?:boolean}={}):AiDeckOption[]{
 const hit=memo.get(key),at=Date.now()
 if(hit&&at-hit.at<600000)return hit.list
 const cards=catalog()
 const list=AI_DECKS.map(d=>({id:d.id,name:d.name,leader:d.leader,base:d.base,formats:(['premier','eternal'] as const).filter(f=>checkAiDeck(d,f,cards,supported,options))})).filter(d=>d.formats.length)
 if(memo.size>8)memo.clear()
 memo.set(key,{at,list});return list
}
/** Resolve a catalogue id for this format; the result passes the same checks as a player's deck. */
export function aiDeck(id:unknown,format:Format,catalog:LegalityCard[],supported:ReadonlySet<string>,options:{now?:Date;homeworldsReleased?:boolean}={}):ConstructedDeck{
 const entry=typeof id==='string'?AI_DECKS.find(d=>d.id===id):undefined
 if(!entry)throw new PtpPlayError(404,'ai_deck_not_found','Choose one of Leebo’s decks.')
 const deck=checkAiDeck(entry,format,catalog,supported,options)
 if(!deck)throw new PtpPlayError(409,'ai_deck_unavailable','That deck is not playable in this format right now.')
 return deck
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
