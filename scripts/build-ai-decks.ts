/**
 * SUPERSEDED (2026-10-18): data/ai-decks.json is now curated, 20 decks per format; see
 * data/ai-decks.md. This generator only knows constructed decks, so it refuses to run
 * unless passed --legacy (and then writes data/ai-decks.legacy.json, never the catalogue).
 *
 * Refreshed data/ai-decks.json, Leebo's constructed deck catalogue.
 *
 *   npx tsx scripts/build-ai-decks.ts --baize ../../caldred/baize/crates/games/swu/data
 *   SWUAPI_API_KEY=… npx tsx scripts/build-ai-decks.ts --baize … --since 2026-08-01
 *
 * Only decks legal in Premier or Eternal today whose every card is in
 * data/native-support/all.json are written. Names use swuapi's archetype nickname.
 */
import {writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fromBaize,fromSwuapi,type SwuapiDecklist} from './aiDeckSources'
import {checkAiDeck,legality,type AiDeckEntry} from '../src/services/play/native/aiDecks'
import {cardCatalog} from '../src/services/play/cardPool'
import {getAllCards} from '../src/utils/cardData'

if(!process.argv.includes('--legacy')){console.error('data/ai-decks.json is curated; see data/ai-decks.md. Pass --legacy to write data/ai-decks.legacy.json.');process.exit(1)}
const arg=(name:string)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:undefined}
const api=process.env.SWUAPI_URL||'https://api.swuapi.com'
const now=new Date(),catalog=cardCatalog(now)
const support=JSON.parse(readFileSync(new URL('../data/native-support/all.json',import.meta.url),'utf8')) as {supportedCardIds:string[];version:string;engineRevision:string}
const supported=new Set(support.supportedCardIds)
const options=legality(now)

async function swuapiDecks():Promise<AiDeckEntry[]>{
 const key=process.env.SWUAPI_API_KEY
 if(!key){console.log('SWUAPI_API_KEY not set: skipping swuapi tournament lists.');return []}
 const since=arg('since')??new Date(now.getTime()-60*864e5).toISOString().slice(0,10)
 const rows:SwuapiDecklist[]=[]
 let after=''
 for(let page=0;page<25;page++){
  const url=new URL('/decklists',api);url.search=new URLSearchParams({since,hasCards:'true',limit:'200',after}).toString()
  const res=await fetch(url,{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)})
  if(!res.ok)throw Error(`swuapi /decklists ${res.status}`)
  const body=await res.json() as {decklists:SwuapiDecklist[];pagination?:{nextCursor?:string|null;next_cursor?:string|null}}
  rows.push(...body.decklists)
  const next=body.pagination?.nextCursor??body.pagination?.next_cursor
  if(!next||!body.decklists.length)break;after=next
 }
 return fromSwuapi(rows,catalog,supported)
}

// Archetype nickname by leader and base, as the Play setup shows it elsewhere.
const uuids=new Map(getAllCards().filter(c=>c.variantType==='Normal'||!c.variantType).map(c=>[String(c.cardId).replace('-','_'),String(c.id)]))
async function nickname(d:AiDeckEntry,format:'premier'|'eternal'){
 const l=uuids.get(d.leader),b=uuids.get(d.base);if(!l||!b)return null
 try{const url=new URL('/archetypes/resolve',api);url.search=new URLSearchParams({leader_card_uuid:l,base_card_uuid:b,format:format==='eternal'?'Eternal':'Premier'}).toString();const r=await fetch(url,{signal:AbortSignal.timeout(8000)});const v=r.ok?await r.json():null;return typeof v?.nickname==='string'&&v.nickname.trim()?v.nickname.trim() as string:null}catch{return null}
}

const baizeDir=arg('baize')
if(!baizeDir)throw Error('Pass --baize <baize>/crates/games/swu/data')
const candidates=[...await swuapiDecks(),...fromBaize(baizeDir)]
const decks:AiDeckEntry[]=[]
for(const d of candidates){
 const formats=(['premier','eternal'] as const).filter(f=>checkAiDeck(d,f,catalog,supported,options))
 if(!formats.length){console.log(`skip ${d.id}: not legal and fully supported`);continue}
 if(d.id.startsWith('baize-'))d.name=await nickname(d,formats[0]!)??d.name
 decks.push(d)
}
const body={decks}
const out={version:createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0,16),generatedAt:now.toISOString().slice(0,10),engineRevision:support.engineRevision,...body}
writeFileSync(new URL('../data/ai-decks.legacy.json',import.meta.url),JSON.stringify(out,null,1)+'\n')
console.log(`Wrote ${decks.length} decks.`)
