import {test} from 'node:test'
import assert from 'node:assert/strict'
import {AI_DECKS,aiDeckCatalogue,resetAiDeckCatalogueCache,type AiDeckEntry} from './aiDecks'
import {buildAiDeckCatalogue,constructedFromWayfinder,limitedFromBuiltDecks,type BuiltDeckRow,type WayfinderDeck} from './aiDeckRefresh'
import {loadSupport} from './savedDeck'
import {cardCatalog} from '../cardPool'

const now=new Date()
const support=loadSupport('data/native-support/all.json')
const premier=AI_DECKS.filter(d=>d.format==='premier')
const asWayfinder=(d:AiDeckEntry,i:number):WayfinderDeck=>({rank:i+1,archetypeUuid:`uuid-${d.id}`,nickname:d.name,name:d.archetype??d.name,games:1000-i,leader:d.leader,base:d.base,
 deck:d.deck.map(c=>({id:c.id,count:c.count,name:null,subtitle:null,type:null})),sideboard:[],source:{kind:'tournament',placement:1,tournament:'Planetary Qualifier',tier:'PQ',date:'2026-10-11'}})

test('constructed: Wayfinder decks are converted, checked and capped; a card named without an ID resolves by name; an unknown card skips the deck',async()=>{
 const s=await support,catalog=cardCatalog(now)
 const decks=premier.map(asWayfinder)
 // The first deck's first card arrives by name only, as some tournament lists give it.
 const first=decks[0]!,named=catalog.find(c=>c.id===premier[0]!.deck[0]!.id)!
 first.deck[0]={id:null,count:first.deck[0]!.count,name:named.name,subtitle:named.subtitle??null,type:named.type}
 decks.splice(1,0,{...asWayfinder(premier[1]!,1),archetypeUuid:'broken',nickname:'Broken',deck:[{id:'ZZZ_999',count:50,name:null,subtitle:null,type:null}]})
 const r=constructedFromWayfinder('premier',decks,s,now,20)
 assert.equal(r.decks.length,20)
 assert.deepEqual(r.skipped,['Broken: unknown card'])
 assert.deepEqual(r.decks[0]!.deck,premier[0]!.deck,'the named card mapped back to its engine ID')
 assert.equal(r.decks[0]!.source.label,'1st, Planetary Qualifier')
 assert.ok(r.decks.every((d,i)=>d.rank===i+1&&d.id.startsWith('premier-uuid-')))
})

test('the catalogue: a short format keeps its previous decks, Wayfinder down keeps Eternal whole, Limited takes the winning record',async()=>{
 const s=await support
 const sealed=AI_DECKS.filter(d=>d.format==='sealed'&&d.set==='HMW').slice(0,3)
 const row=(d:AiDeckEntry,i:number,w:number,l:number):BuiltDeckRow=>({id:`${d.id}-${i}`,leader:d.leader,base:d.base,deck:d.deck,w,l})
 // Tarfful's archetype: one losing and one winning build; the winning one is picked.
 const winner={...sealed[0]!,deck:[...sealed[0]!.deck].reverse()}
 const rows=[row(sealed[0]!,0,0,2),row(winner,1,3,0),row(sealed[1]!,2,0,0),row(sealed[2]!,3,0,0),row(sealed[2]!,4,0,0)]
 const {decks,report}=await buildAiDeckCatalogue({support:s,previous:AI_DECKS,now,
  wayfinder:async format=>{if(format==='eternal')throw Error('HTTP 502');return premier.slice(0,18).map(asWayfinder)},
  builtDecks:async(kind,set)=>kind==='sealed'&&set==='HMW'?rows:[]})
 assert.deepEqual(report.premier,{fresh:18,kept:2,skipped:[]})
 assert.equal(report.eternal!.fresh,0);assert.equal(report.eternal!.kept,20);assert.match(report.eternal!.skipped[0]!,/HTTP 502/)
 assert.deepEqual(decks.filter(d=>d.format==='eternal').map(d=>d.id),AI_DECKS.filter(d=>d.format==='eternal').map(d=>d.id))
 assert.equal(report['sealed:HMW']!.fresh,3)
 const fresh=decks.filter(d=>d.format==='sealed'&&d.set==='HMW')
 assert.equal(fresh.length,20,'17 previous Sealed decks fill the slot')
 assert.equal(fresh[0]!.source.label,'PTP sealed, 3-0')
 assert.equal(fresh[1]!.source.label,'PTP sealed, typical build of 2','more builds rank first')
 assert.equal(new Set(fresh.map(d=>`${d.leader}:${d.base}`)).size,20)
 assert.ok(decks.filter(d=>d.format==='premier').every((d,i)=>d.rank===i+1))
})

test('Limited ignores bot-sized decks under 30 cards and archetypes without a playable build',async()=>{
 const s=await support,d=AI_DECKS.find(x=>x.format==='draft')!
 assert.deepEqual(limitedFromBuiltDecks('draft','HMW',[{id:'x',leader:d.leader,base:d.base,deck:[{id:d.deck[0]!.id,count:10}],w:5,l:0}],s,now),[])
 const one=limitedFromBuiltDecks('draft','HMW',[{id:'y',leader:d.leader,base:d.base,deck:d.deck,w:0,l:0}],s,now)
 assert.equal(one.length,1);assert.equal(one[0]!.set,'HMW');assert.equal(one[0]!.format,'draft')
})

test('aiDeckCatalogue: the saved catalogue when there is one, else the shipped decks',async()=>{
 resetAiDeckCatalogueCache()
 const saved=[{...AI_DECKS[0]!,id:'saved-1'}]
 assert.deepEqual((await aiDeckCatalogue(async()=>({decks:saved,version:'v2'}))).decks.map(d=>d.id),['saved-1'])
 resetAiDeckCatalogueCache()
 assert.equal((await aiDeckCatalogue(async()=>{throw Error('no table')})).decks,AI_DECKS)
 resetAiDeckCatalogueCache()
 assert.equal((await aiDeckCatalogue(async()=>null)).decks,AI_DECKS)
 resetAiDeckCatalogueCache()
})

test('a list row with the wrong type still resolves by its name and subtitle',async()=>{
 const {engineIds}=await import('./aiDeckRefresh')
 const s=await support,{resolve}=engineIds(s,now)
 const poe=cardCatalog(now).find(c=>c.name==='Poe Dameron'&&c.subtitle==='Quick to Improvise')!
 assert.ok(resolve({id:'P25_168',name:'Poe Dameron',subtitle:'Quick to Improvise',type:'Deck'}),'a promo whose row says "Deck"')
 assert.equal(resolve({id:null,name:poe.name,subtitle:poe.subtitle??null,type:'Deck'}),resolve({id:poe.id}))
 assert.equal(resolve({id:null,name:'No Such Card',subtitle:null,type:'Unit'}),null)
})
