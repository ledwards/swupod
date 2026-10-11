/**
 * Pure readers for Leebo's constructed deck catalogue (data/ai-decks.json).
 * Sources, strongest first:
 *  1. swuapi tournament decklists (top finishes at PQ tier and above), when a key is available;
 *  2. Baize's real tournament lists (decks whose cards carry `_real` counts);
 *  3. Baize's Spotlight decks: official 50-card products the engine fully implements.
 * Starter, Intro Battle and lab decks are not offered.
 */
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import type {AiDeckEntry} from '../src/services/play/native/aiDecks'
import type {LegalityCard} from '../src/services/play/constructedValidation'

type Count={id:string;count:number}
type BaizeCard={id:string;count:number;_real?:number}
type BaizeDeck={leader:string;base:string;cards:BaizeCard[]}
type BaizeRow={id:string;label:string;file:string;key:string;lab?:boolean}

const merge=(cards:Count[])=>{const m=new Map<string,number>();for(const c of cards)if(c.count>0)m.set(c.id,(m.get(c.id)??0)+c.count);return [...m].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,count}))}

/** Baize's play catalogue (crates/games/swu/data). Real lists use their tournament counts. */
export function fromBaize(dataDir:string):AiDeckEntry[]{
 const rows=(JSON.parse(readFileSync(join(dataDir,'play-decks.json'),'utf8')) as {decks:BaizeRow[]}).decks
 const out:AiDeckEntry[]=[]
 for(const row of rows){
  if(row.lab||/starter|intro battle/i.test(row.label))continue
  const deck=(JSON.parse(readFileSync(join(dataDir,row.file),'utf8')) as Record<string,BaizeDeck>)[row.key]
  if(!deck)continue
  const real=deck.cards.some(c=>c._real!==undefined)
  const label=row.label.split('—').pop()!.trim()
  out.push({id:`baize-${row.id}`,name:row.label.split('—')[0]!.trim(),leader:deck.leader,base:deck.base,deck:merge(deck.cards.map(c=>({id:c.id,count:real?c._real??c.count:c.count}))),sideboard:[],source:real?{kind:'tournament',label:'Planetary Qualifier'}:{kind:'spotlight',label}})
 }
 // Real tournament lists first, then the newest Spotlight products.
 const setOrder=['HMW','ASH','LAW','SEC','LOF','JTL','TWI','SHD','SOR']
 const rank=(d:AiDeckEntry)=>d.source.kind==='tournament'?-1:Math.max(0,setOrder.indexOf(d.source.label.split(' ')[0]!))
 return out.sort((a,b)=>rank(a)-rank(b))
}

export interface SwuapiDecklist {uuid:string;format:string;tier?:string|null;final_placement?:number|null;archetype_name?:string|null;tournament_name?:string|null;tournament_date?:string|null;leader_name?:string|null;decklist:{name:string;cardName?:string|null;subtitle?:string|null;type:string;count:number;sideboard:boolean}[]}

/** One id per card identity, preferring a print the engine supports. */
export function nameIndex(catalog:LegalityCard[],supported:ReadonlySet<string>){
 const index=new Map<string,string>()
 for(const c of catalog){const key=JSON.stringify([c.name.toLowerCase(),(c.subtitle??'').toLowerCase(),c.type]);const prev=index.get(key);if(!prev||(!supported.has(prev)&&supported.has(c.id)))index.set(key,c.id)}
 return index
}
const typeOf=(t:string)=>/unit/i.test(t)?'Unit':/leader/i.test(t)?'Leader':/base/i.test(t)?'Base':/event/i.test(t)?'Event':/upgrade/i.test(t)?'Upgrade':t

/** swuapi /decklists rows into catalogue entries. Lists with an unknown card are skipped. */
export function fromSwuapi(rows:SwuapiDecklist[],catalog:LegalityCard[],supported:ReadonlySet<string>,options:{top?:number;perFormat?:number}={}):AiDeckEntry[]{
 const index=nameIndex(catalog,supported),top=options.top??8,perFormat=options.perFormat??8
 const tiers=new Set(['PQ','SQ','RQ','GC','Worlds','Galactic Championship','Regional','Sector','Planetary'])
 const picked=new Map<string,AiDeckEntry[]>(),seen=new Set<string>()
 const sorted=[...rows].filter(r=>(r.final_placement??99)<=top&&(!r.tier||tiers.has(r.tier))).sort((a,b)=>(a.final_placement??99)-(b.final_placement??99)||String(b.tournament_date).localeCompare(String(a.tournament_date)))
 for(const r of sorted){
  const format=/eternal/i.test(r.format)?'eternal':/premier|premiere/i.test(r.format)?'premier':null
  if(!format)continue
  const list=picked.get(format)??[];if(list.length>=perFormat)continue
  const id=(c:SwuapiDecklist['decklist'][number])=>{const name=c.cardName??c.name.split(',')[0]!.trim(),subtitle=c.subtitle??(c.name.includes(',')?c.name.split(',').slice(1).join(',').trim():'');return index.get(JSON.stringify([name.toLowerCase(),subtitle.toLowerCase(),typeOf(c.type)]))}
  const ids=r.decklist.map(c=>({c,id:id(c)}))
  if(ids.some(x=>!x.id))continue
  const leader=ids.find(x=>typeOf(x.c.type)==='Leader')?.id,base=ids.find(x=>typeOf(x.c.type)==='Base')?.id
  if(!leader||!base)continue
  const archetype=(r.archetype_name??'').trim()||r.leader_name||leader
  // One list per archetype keeps the picker varied.
  if(seen.has(`${format}:${archetype}`))continue;seen.add(`${format}:${archetype}`)
  const cards=ids.filter(x=>!['Leader','Base'].includes(typeOf(x.c.type)))
  list.push({id:`swuapi-${r.uuid}`,name:archetype,leader,base,deck:merge(cards.filter(x=>!x.c.sideboard).map(x=>({id:x.id!,count:x.c.count}))),sideboard:merge(cards.filter(x=>x.c.sideboard).map(x=>({id:x.id!,count:x.c.count}))),source:{kind:'tournament',label:r.tournament_name??'Tournament',...(r.final_placement?{placement:r.final_placement}:{}),...(r.tournament_date?{date:r.tournament_date.slice(0,10)}:{})}})
  picked.set(format,list)
 }
 return [...picked.values()].flat()
}
