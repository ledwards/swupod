/**
 * Daily refresh of Leebo's saved decks: 20 per format, one strong list of each of the
 * format's most-played archetypes (data/ai-decks.md has the rules).
 *
 * - Premier and Eternal come from Wayfinder's /api/ai/saved-decks (Karabast play rank;
 *   best-placed tournament list, else a Karabast winning record).
 * - Draft and Sealed come from PTP's own built decks, per current set: archetype is
 *   leader + base colour; the list is its best winning record, else its most typical
 *   30-card build.
 *
 * Every deck passes the same legality or engine-support check as a player's deck. A format
 * that comes back short (Wayfinder down, a deck the engine can't play yet) keeps its
 * previous decks in the empty slots, so Leebo never loses a format.
 */
import {createHash} from 'node:crypto'
import {cardCatalog,currentPoolSets} from '../cardPool'
import {getAllCards} from '../../../utils/cardData'
import {archetypeShortName} from '../../../utils/archetypeName'
import {loadSupport} from './savedDeck'
import {aiDeckCatalogue,checkAiDeck,legality,limitedSupported,resetAiDeckCatalogueCache,type AiDeckEntry,type AiDeckFormat} from './aiDecks'

export const AI_DECKS_PER_FORMAT=20
const STALE_MS=24*3600_000
const LIMITED_WINDOW_DAYS=60
/** A set nobody drafts any more has too few recent decks: then its whole history counts. */
const ALL_HISTORY=new Date(0)
type Support=Awaited<ReturnType<typeof loadSupport>>
type Count={id:string;count:number}
export interface WayfinderCard {id:string|null;count:number;name:string|null;subtitle:string|null;type:string|null}
export interface WayfinderDeck {rank:number;archetypeUuid:string;nickname:string|null;name:string;games:number;leader:string;base:string;deck:WayfinderCard[];sideboard:WayfinderCard[];source:{kind:'tournament';placement:number;tournament:string|null;tier:string|null;date:string|null}|{kind:'karabast';wins:number;losses:number}}
export interface BuiltDeckRow {id:string;leader:string;base:string;deck:Count[];w:number;l:number}
export interface RefreshReport {[slot:string]:{fresh:number;kept:number;skipped:string[]}}

const typeOf=(t:string|null|undefined)=>!t?'':/unit/i.test(t)?'Unit':/leader/i.test(t)?'Leader':/base/i.test(t)?'Base':/event/i.test(t)?'Event':/upgrade/i.test(t)?'Upgrade':t

/** A printing's or a named card's engine ID, preferring a print the engine supports; null when unknown. */
export function engineIds(support:Support,now=new Date()){
 const catalog=cardCatalog(now),byId=new Map(catalog.map(c=>[c.id,c])),supported=support.policy.supportedCardIds
 const engine=(id:string)=>{const c=byId.get(id);return c?.ptpId?(support.catalog.get(c.ptpId)?.engineId??null):null}
 const byName=new Map<string,string>(),types=new Map<string,string>(),byNameAnyType=new Map<string,string|null>()
 for(const c of catalog){const e=engine(c.id);if(e&&!types.has(e))types.set(e,c.type)}
 // Prefer a print the engine supports when several prints share a name.
 const prefer=(prev:string|undefined,e:string)=>!prev||(!supported.has(prev)&&supported.has(e))
 for(const c of catalog){
  const e=engine(c.id);if(!e)continue
  const key=JSON.stringify([c.name.toLowerCase(),(c.subtitle??'').toLowerCase(),c.type])
  if(prefer(byName.get(key),e))byName.set(key,e)
  // Name and subtitle alone, while they name cards of one type (null once two types share them).
  const loose=JSON.stringify([c.name.toLowerCase(),(c.subtitle??'').toLowerCase()]),was=byNameAnyType.get(loose)
  if(was===undefined)byNameAnyType.set(loose,e)
  else if(was!==null&&types.get(was)!==c.type)byNameAnyType.set(loose,null)
  else if(was!==null&&prefer(was,e))byNameAnyType.set(loose,e)
 }
 const resolve=(card:{id?:string|null;name?:string|null;subtitle?:string|null;type?:string|null}):string|null=>{
  const id=card.id?String(card.id).toUpperCase().replace('-','_'):null
  const direct=id?engine(id):null
  if(direct)return direct
  if(!card.name)return null
  // A list row's type can be wrong ("Deck"); a name and subtitle that name one card still count.
  return byName.get(JSON.stringify([card.name.toLowerCase(),(card.subtitle??'').toLowerCase(),typeOf(card.type)]))??byNameAnyType.get(JSON.stringify([card.name.toLowerCase(),(card.subtitle??'').toLowerCase()]))??null
 }
 /** The card's own type, whatever a list row calls it. */
 const typeOfEngine=(engineId:string)=>types.get(engineId)
 return {resolve,typeOfEngine}
}

function mergeCounts(cards:Count[]):Count[]{const m=new Map<string,number>();for(const c of cards)if(c.count>0)m.set(c.id,(m.get(c.id)??0)+c.count);return [...m].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,count}))}

/** Wayfinder's decks for one format, converted and checked; the first `limit` playable, one per archetype. */
export function constructedFromWayfinder(format:'premier'|'eternal',decks:WayfinderDeck[],support:Support,now=new Date(),limit=AI_DECKS_PER_FORMAT):{decks:AiDeckEntry[];skipped:string[]}{
 const {resolve,typeOfEngine}=engineIds(support,now),catalog=cardCatalog(now),out:AiDeckEntry[]=[],skipped:string[]=[],seen=new Set<string>()
 for(const d of decks){
  if(out.length>=limit)break
  const label=d.nickname??d.name
  const convert=(cards:WayfinderCard[])=>{const res:Count[]=[];for(const c of cards){const id=resolve(c);if(!id)return null;if(!['Leader','Base'].includes(typeOfEngine(id)??typeOf(c.type)))res.push({id,count:c.count})}return mergeCounts(res)}
  const leader=resolve({id:d.leader,type:'Leader'}),base=resolve({id:d.base,type:'Base'}),deck=convert(d.deck),side=convert(d.sideboard)
  // Leebo doesn't sideboard; a Karabast registration can hold more than the 10-card limit.
  const sideboard=side&&side.reduce((n,c)=>n+c.count,0)<=10?side:side&&[]
  if(!leader||!base||!deck||!sideboard){skipped.push(`${label}: unknown card`);continue}
  if(seen.has(`${leader}:${base}`))continue
  const entry:AiDeckEntry={id:`${format}-${d.archetypeUuid}`,name:label.replace(/\s*\((Premier|Eternal)\)\s*$/,''),format,rank:out.length+1,archetype:d.name,leader,base,deck,sideboard,
   source:d.source.kind==='tournament'?{kind:'tournament',label:`${d.source.placement===1?'1st':`#${d.source.placement}`}${d.source.tournament?`, ${d.source.tournament}`:''}`,placement:d.source.placement,...(d.source.date?{date:d.source.date}:{})}
    :{kind:'karabast',label:`Karabast, ${d.source.wins}-${d.source.losses} in Wayfinder-tracked games`}}
  if(!checkAiDeck(entry,format,catalog,support.policy.supportedCardIds,legality(now))){skipped.push(`${label}: not playable in ${format}`);continue}
  seen.add(`${leader}:${base}`);out.push(entry)
 }
 return {decks:out,skipped}
}

const COLOR:Record<string,string>={Vigilance:'Blue',Command:'Green',Aggression:'Red',Cunning:'Yellow'}
/** One set's Draft or Sealed decks from PTP's built decks: top archetypes by count, best winning record else most typical build. */
export function limitedFromBuiltDecks(kind:'draft'|'sealed',set:string,rows:BuiltDeckRow[],support:Support,now=new Date(),limit=AI_DECKS_PER_FORMAT):AiDeckEntry[]{
 const {resolve}=engineIds(support,now)
 const cards=new Map(getAllCards().map(c=>[String(c.cardId).replace('-','_'),c]))
 const groups=new Map<string,{name:string;rows:BuiltDeckRow[]}>()
 for(const r of rows){
  const L=cards.get(r.leader),B=cards.get(r.base);if(!L||!B)continue
  const color=COLOR[(B.aspects as string[]|undefined)?.[0]??'']??'None'
  const key=`${r.leader}:${color}:${B.hp??''}`
  const name=archetypeShortName({leaderName:String(L.name),baseAspects:(B.aspects as string[]|undefined)??[],baseHp:(B.hp as number|undefined)??null})??`${L.name} ${color}`
  const g=groups.get(key)??{name,rows:[]};g.rows.push(r);groups.set(key,g)
 }
 const out:AiDeckEntry[]=[]
 for(const g of [...groups.values()].sort((a,b)=>b.rows.length-a.rows.length)){
  if(out.length>=limit)break
  const n=g.rows.length,inc=new Map<string,number>(),size=(r:BuiltDeckRow)=>r.deck.reduce((t,c)=>t+c.count,0)
  for(const r of g.rows)for(const c of r.deck)inc.set(c.id,(inc.get(c.id)??0)+1)
  const typical=(r:BuiltDeckRow)=>r.deck.reduce((t,c)=>t+(inc.get(c.id)??0)/n,0)/Math.max(1,r.deck.length)-Math.abs(size(r)-30)*0.01
  const candidates=g.rows.filter(r=>size(r)>=30),winners=candidates.filter(r=>r.w>r.l)
  const best=winners.length?winners.sort((a,b)=>(b.w-b.l)-(a.w-a.l)||b.w-a.w||typical(b)-typical(a))[0]:candidates.sort((a,b)=>typical(b)-typical(a))[0]
  if(!best)continue
  const leader=resolve({id:best.leader}),base=resolve({id:best.base}),deck=best.deck.map(c=>({id:resolve({id:c.id}),count:c.count}))
  if(!leader||!base||deck.some(c=>!c.id))continue
  const entry:AiDeckEntry={id:`${kind}-${set.toLowerCase()}-${leader}-${base}`,name:g.name,format:kind,rank:out.length+1,set,archetype:g.name,leader,base,deck:mergeCounts(deck as Count[]),sideboard:[],
   source:{kind:'ptp',label:winners.length?`PTP ${kind}, ${best.w}-${best.l}`:`PTP ${kind}, typical build of ${n}`}}
  if(limitedSupported(entry,support.policy.supportedCardIds))out.push(entry)
 }
 return out
}

/** Fill a slot's empty places with its previous decks (other archetypes only), renumbered. */
function withKept(fresh:AiDeckEntry[],previous:AiDeckEntry[],limit=AI_DECKS_PER_FORMAT){
 const used=new Set(fresh.map(d=>`${d.leader}:${d.base}`)),kept=previous.filter(d=>!used.has(`${d.leader}:${d.base}`)).slice(0,Math.max(0,limit-fresh.length))
 return {decks:[...fresh,...kept].map((d,i)=>({...d,rank:i+1})),kept:kept.length}
}

export async function buildAiDeckCatalogue(deps:{
 support:Support;previous:AiDeckEntry[];now?:Date
 wayfinder:(format:'premier'|'eternal')=>Promise<WayfinderDeck[]>
 builtDecks:(kind:'draft'|'sealed',set:string,since:Date)=>Promise<BuiltDeckRow[]>
}):Promise<{decks:AiDeckEntry[];report:RefreshReport}>{
 const now=deps.now??new Date(),report:RefreshReport={},decks:AiDeckEntry[]=[]
 const slot=(key:string,fresh:AiDeckEntry[],previous:AiDeckEntry[],skipped:string[]=[])=>{const r=withKept(fresh,previous);report[key]={fresh:fresh.length,kept:r.kept,skipped};decks.push(...r.decks)}
 for(const format of ['premier','eternal'] as const){
  const previous=deps.previous.filter(d=>d.format===format)
  try{const r=constructedFromWayfinder(format,await deps.wayfinder(format),deps.support,now);slot(format,r.decks,previous,r.skipped)}
  catch(e){slot(format,[],previous,[`wayfinder: ${e instanceof Error?e.message:String(e)}`])}
 }
 const since=new Date(now.getTime()-LIMITED_WINDOW_DAYS*864e5)
 for(const set of currentPoolSets(now).map(c=>c.setCode).filter(code=>deps.support.policy.supportedSets.has(code)))
  for(const kind of ['draft','sealed'] as const){
   const previous=deps.previous.filter(d=>d.format===kind&&d.set===set)
   try{
    let fresh=limitedFromBuiltDecks(kind,set,await deps.builtDecks(kind,set,since),deps.support,now)
    if(fresh.length<AI_DECKS_PER_FORMAT){const all=limitedFromBuiltDecks(kind,set,await deps.builtDecks(kind,set,ALL_HISTORY),deps.support,now);if(all.length>fresh.length)fresh=all}
    slot(`${kind}:${set}`,fresh,previous)
   }
   catch(e){slot(`${kind}:${set}`,[],previous,[`built decks: ${e instanceof Error?e.message:String(e)}`])}
  }
 // A set that left the current pool keeps no Draft or Sealed decks; nothing else is dropped.
 return {decks,report}
}

const formatOrder:AiDeckFormat[]=['premier','eternal','draft','sealed']
export const catalogueVersion=(decks:AiDeckEntry[])=>createHash('sha256').update(JSON.stringify(decks)).digest('hex').slice(0,16)

/** Production wiring: Wayfinder over HTTP, PTP's database, saved as the one catalogue row. */
export async function refreshAiDecksIfStale(env:Record<string,string|undefined>=process.env):Promise<RefreshReport|null>{
 const {queryRow,queryRows,query,withAdvisoryLock}=await import('../../../../lib/db')
 return withAdvisoryLock('ptp-ai-deck-refresh',async()=>{
  const row=await queryRow('SELECT refreshed_at FROM ptp_ai_deck_catalog WHERE id=$1',['current'])
  if(row&&Date.now()-new Date(String(row.refreshed_at)).getTime()<STALE_MS)return null
  const support=await loadSupport(env.PTP_NATIVE_SUPPORT_PATH||'data/native-support/all.json')
  const origin=(env.WAYFINDER_URL||'https://wayfinder.news').replace(/\/$/,'')
  const {decks,report}=await buildAiDeckCatalogue({support,previous:(await aiDeckCatalogue()).decks,
   wayfinder:async format=>{
    const res=await fetch(`${origin}/api/ai/saved-decks?format=${format}&limit=40`,{signal:AbortSignal.timeout(60_000),redirect:'error'})
    if(!res.ok)throw Error(`HTTP ${res.status}`)
    const body=await res.json() as {data?:{decks?:WayfinderDeck[]}}
    if(!Array.isArray(body.data?.decks))throw Error('unexpected response')
    return body.data!.decks!
   },
   builtDecks:async(kind,set,since)=>(await queryRows(`WITH res AS (SELECT card_pool_id, count(*) FILTER (WHERE result='win') w, count(*) FILTER (WHERE result='loss') l FROM casual_matches WHERE retracted_at IS NULL GROUP BY 1)
     SELECT bd.id::text id, bd.leader->>'id' leader, bd.base->>'id' base, bd.deck,
       greatest(coalesce(cp.wins,0),coalesce(res.w,0))::int w, greatest(coalesce(cp.losses,0),coalesce(res.l,0))::int l
     FROM built_decks bd JOIN card_pools cp ON cp.id=bd.card_pool_id
     LEFT JOIN pod_players dpp ON dpp.pod_id=cp.pod_id AND dpp.user_id=bd.user_id
     LEFT JOIN res ON res.card_pool_id=bd.card_pool_id
     WHERE bd.set_code=$1 AND bd.pool_type=$2 AND bd.built_at>=$3 AND NOT coalesce(dpp.is_bot,false)`,[set,kind,since])) as unknown as BuiltDeckRow[]})
  decks.sort((a,b)=>formatOrder.indexOf(a.format)-formatOrder.indexOf(b.format)||(a.set??'').localeCompare(b.set??'')||a.rank-b.rank)
  await query(`INSERT INTO ptp_ai_deck_catalog(id,decks,version,report,refreshed_at) VALUES('current',$1,$2,$3,NOW())
   ON CONFLICT (id) DO UPDATE SET decks=EXCLUDED.decks,version=EXCLUDED.version,report=EXCLUDED.report,refreshed_at=EXCLUDED.refreshed_at`,[JSON.stringify(decks),catalogueVersion(decks),JSON.stringify(report)])
  resetAiDeckCatalogueCache()
  return report
 })
}
