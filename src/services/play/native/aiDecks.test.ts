import {test} from 'node:test'
import assert from 'node:assert/strict'
import {AI_DECKS,aiDeck,aiDeckOptions,aiLimitedDeck,checkAiDeck,leeboPackWarsDeck,leeboPoolDeck,legality} from './aiDecks'
import {resolveOpponent} from './sharedPlay'
import {loadSupport} from './savedDeck'
import {cardCatalog} from '../cardPool'
import {queueContract} from '../formats'
import {PtpPlayError} from '../playState'
import {unsupportedPackWarsCards,type PackWarsCard} from '../packWarsDeck'

const now=new Date()
const support=loadSupport('data/native-support/all.json')
const code=(e:unknown)=>e instanceof PtpPlayError?e.code:String(e)

test('Leebo keeps 20 decks per format, each legal or engine supported in its own format; options carry no decklists',async()=>{
 const s=await support,catalog=cardCatalog(now)
 assert.equal(new Set(AI_DECKS.map(d=>d.id)).size,AI_DECKS.length)
 for(const f of ['premier','eternal','draft','sealed'] as const){
  const decks=AI_DECKS.filter(d=>d.format===f)
  assert.equal(decks.length,20,f)
  assert.deepEqual(decks.map(d=>d.rank),[...decks.map(d=>d.rank)].sort((a,b)=>a-b),`${f} is ordered by archetype rank`)
  assert.equal(new Set(decks.map(d=>`${d.leader}:${d.base}`)).size,20,`${f} archetypes are unique`)
 }
 for(const d of AI_DECKS){
  assert.ok(d.name&&d.leader&&d.base&&d.source.label,d.id)
  if(d.format==='draft'||d.format==='sealed'){
   assert.equal(d.set,'HMW',d.id)
   assert.ok(d.deck.reduce((n,c)=>n+c.count,0)>=30,d.id)
   for(const id of [d.leader,d.base,...d.deck.map(c=>c.id)])assert.ok(s.policy.supportedCardIds.has(id),`${d.id}: ${id}`)
  }else assert.ok(checkAiDeck(d,d.format,catalog,s.policy.supportedCardIds,legality(now)),`${d.id} is not playable in ${d.format}`)
 }
 const options=aiDeckOptions('test',()=>catalog,s.policy.supportedCardIds,legality(now))
 assert.equal(options.length,80)
 assert.ok(options.every(o=>o.formats.length===1),'each deck is offered under its own format only')
 assert.ok(!('deck' in options[0]!),'the lobby state never ships decklists')
})

test('a saved Draft or Sealed deck resolves only for its own kind and set',async()=>{
 const s=await support,ids=s.policy.supportedCardIds
 const draftDeck=AI_DECKS.find(d=>d.format==='draft')!,sealedDeck=AI_DECKS.find(d=>d.format==='sealed')!
 const draft=queueContract({format:'limited',limited:'draft',set:'HMW',pool:'current'}),sealed=queueContract({format:'limited',limited:'six',set:'HMW',pool:'current'}),noFreeze=async()=>{throw Error('no freeze')}
 assert.equal(aiLimitedDeck(draftDeck.id,draft,ids).leader,draftDeck.leader)
 assert.equal((await resolveOpponent({opponentPreset:sealedDeck.id},sealed,'HMW',s,now,noFreeze))?.leader,sealedDeck.leader)
 assert.equal(aiLimitedDeck(sealedDeck.id,queueContract({format:'limited',limited:'eight',set:'HMW',pool:'current'}),ids).base,sealedDeck.base)
 assert.equal(aiLimitedDeck(draftDeck.id,queueContract({format:'limited',limited:'chaos',pool:'current'}),ids).leader,draftDeck.leader)
 assert.throws(()=>aiLimitedDeck(draftDeck.id,sealed,ids),e=>code(e)==='ai_deck_unavailable')
 assert.throws(()=>aiLimitedDeck(sealedDeck.id,queueContract({format:'limited',limited:'six',set:'LAW',pool:'current'}),ids),e=>code(e)==='ai_deck_unavailable')
 assert.throws(()=>aiLimitedDeck(AI_DECKS.find(d=>d.format==='premier')!.id,sealed,ids),e=>code(e)==='ai_deck_not_found')
 assert.throws(()=>aiLimitedDeck(draftDeck.id,draft,new Set([draftDeck.leader])),e=>code(e)==='ai_deck_unavailable')
 assert.throws(()=>aiDeck(draftDeck.id,'premier',cardCatalog(now),ids,legality(now)),e=>code(e)==='ai_deck_unavailable')
})

test('a preset resolves to a validated deck; unknown and out-of-format presets are refused',async()=>{
 const s=await support,catalog=cardCatalog(now),options=aiDeckOptions('test',()=>catalog,s.policy.supportedCardIds,legality(now))
 const premier=options.find(o=>o.formats.includes('premier'))!
 const deck=aiDeck(premier.id,'premier',catalog,s.policy.supportedCardIds,legality(now))
 assert.equal(deck.leader,premier.leader)
 assert.throws(()=>aiDeck('nope','premier',catalog,s.policy.supportedCardIds,legality(now)),e=>code(e)==='ai_deck_not_found')
 const eternal=options.find(o=>o.formats.includes('eternal'))!
 assert.throws(()=>aiDeck(eternal.id,'premier',catalog,s.policy.supportedCardIds,legality(now)),e=>code(e)==='ai_deck_unavailable')
 assert.throws(()=>aiDeck(premier.id,'eternal',catalog,s.policy.supportedCardIds,legality(now)),e=>code(e)==='ai_deck_unavailable','each deck plays only its own format')
 // An entry with a card the engine lacks is never offered.
 const d=AI_DECKS[0]!
 assert.equal(checkAiDeck(d,'eternal',catalog,new Set([d.leader]),legality(now)),null)
})

test('resolveOpponent: presets, your own constructed deck, and the mirror',async()=>{
 const s=await support,catalog=cardCatalog(now)
 const premier=queueContract({format:'premier',limited:'six',pool:'current'}),noFreeze=async()=>{throw Error('not limited')}
 const id=aiDeckOptions('test',()=>catalog,s.policy.supportedCardIds,legality(now)).find(o=>o.formats.includes('premier'))!.id
 const preset=await resolveOpponent({opponentPreset:id},premier,'',s,now,noFreeze)
 assert.equal(preset?.leader,AI_DECKS.find(d=>d.id===id)!.leader)
 assert.equal(await resolveOpponent({},premier,'',s,now,noFreeze),undefined)
 const entry=AI_DECKS.find(d=>d.id===id)!
 const own=await resolveOpponent({opponentDeck:{leader:{id:entry.leader,count:1},base:{id:entry.base,count:1},deck:entry.deck}},premier,'',s,now,noFreeze)
 assert.equal(own?.cards.reduce((n,c)=>n+c.count,0),entry.deck.reduce((n,c)=>n+c.count,0))
 await assert.rejects(resolveOpponent({opponentDeck:{leader:entry.leader,base:entry.base,deck:[]}},premier,'',s,now,noFreeze),e=>code(e)==='invalid_deck')
 await assert.rejects(resolveOpponent({opponentPreset:'missing'},premier,'',s,now,noFreeze),e=>code(e)==='ai_deck_not_found')
})

test('resolveOpponent: your other limited deck is frozen and must match the contract',async()=>{
 const s=await support
 const sealed=queueContract({format:'limited',limited:'six',set:'LAW',pool:'current'})
 const snapshot={leader:'LAW_002',base:'LAW_020',deck:[{id:'LAW_100',count:30}],setCode:'LAW',poolType:'sealed',packCount:6}
 const frozen:string[]=[]
 const deck=await resolveOpponent({opponentPoolShareId:'mine'},sealed,'LAW',s,now,async id=>{frozen.push(id);return {snapshot}})
 assert.deepEqual(frozen,['mine']);assert.equal(deck?.leader,'LAW_002')
 await assert.rejects(resolveOpponent({opponentPoolShareId:'eight'},sealed,'LAW',s,now,async()=>({snapshot:{...snapshot,packCount:8}})),e=>code(e)==='opponent_format')
 await assert.rejects(resolveOpponent({opponentPool:'someone'},sealed,'LAW',s,now,async()=>({snapshot})),e=>code(e)==='invalid_opponent')
 // Constructed fields never leak into a limited game.
 assert.equal(await resolveOpponent({opponentDeck:{}},sealed,'LAW',s,now,async()=>({snapshot})),undefined)
})

test('Leebo’s pool: he opens the contract’s packs and builds a supported deck',async()=>{
 const s=await support
 for(const contract of [queueContract({format:'limited',limited:'six',set:'LAW',pool:'current'}),queueContract({format:'limited',limited:'draft',set:'HMW',pool:'current'})]){
  const deck=await leeboPoolDeck(contract,contract.set,s)
  assert.equal(deck.setCode,contract.set);assert.equal(deck.packCount,6)
  assert.ok(deck.cards.reduce((n,c)=>n+c.count,0)>=30)
  for(const id of [deck.leader,deck.base,...deck.cards.map(c=>c.id)])assert.ok(s.policy.supportedCardIds.has(id),id)
 }
 const eight=await leeboPoolDeck(queueContract({format:'limited',limited:'eight',set:'LAW',pool:'current'}),'LAW',s,(set,n)=>{assert.equal(set,'LAW');assert.equal(n,8);return []}).catch(e=>e)
 assert.equal(code(eight),'bot_deck_unavailable')
 const chaos=await leeboPoolDeck(queueContract({format:'limited',limited:'chaos',pool:'current'}),'SEC,LAW',s,(set)=>{assert.equal(set,'SEC');return []}).catch(e=>e)
 assert.equal(code(chaos),'bot_deck_unavailable')
 await assert.rejects(leeboPoolDeck(queueContract({format:'premier',limited:'six',pool:'current'}),'',s),e=>code(e)==='invalid_opponent')
})

// The Pack Wars test below opens real SOR packs and expects all 32 cards to play, which holds only while the engine
// supports every SOR printing. Checked here over the whole set, so a gap fails every run instead of the ~0.3% of runs
// whose packs happen to hold it (a Hyperspace Hardpoint Heavy Blaster typed Unit upstream left SOR 385 unsupported).
test('SPEC: every SOR printing a booster can hold maps to a card the engine supports',async()=>{
 const s=await support,{getAllCards}=await import('../../../utils/cardData')
 const sor=getAllCards().filter(c=>c.set==='SOR'&&!String(c.type).includes('Token'))
 assert.ok(sor.length>900,`expected the full SOR printing list, got ${sor.length}`)
 const missing=sor.filter(c=>unsupportedPackWarsCards([c as unknown as PackWarsCard],s).length>0).map(c=>`${c.cardId} ${c.variantType} ${c.name} [${c.type}]`)
 assert.deepEqual(missing,[])
})

test('SPEC: Pack Wars — Leebo opens two packs of the set and plays all of them, with no 30-card floor',async()=>{
 const s=await support
 const opened:string[]=[]
 const {snapshot,cards}=await leeboPackWarsDeck({setCode:'SOR',packCount:2,participantId:'leebo-1',ownerUserId:'owner'},s,undefined)
 assert.equal(snapshot.poolType,'pack_wars');assert.equal(snapshot.packCount,2);assert.equal(snapshot.ownerUserId,'owner')
 assert.equal(cards.length,32,'SPEC: two 16-card packs')
 // SPEC: every card that isn't a leader or base (28, or fewer when a foil slot holds a leader or base).
 assert.equal(snapshot.deck.reduce((n,c)=>n+c.count,0),cards.filter(c=>!['Leader','Base'].includes(String(c.type))).length)
 assert.ok(snapshot.deck.reduce((n,c)=>n+c.count,0)<=28)
 for(const id of [snapshot.leader,snapshot.base,...snapshot.deck.map(c=>c.id)])assert.ok(s.policy.supportedCardIds.has(id),id)
 // Cards the engine lacks stay in the wrapper instead of refusing Leebo's pool.
 const sor=(type:string)=>[...s.catalog.values()].find(c=>c.type===type&&c.engineId.startsWith('SOR')&&s.policy.supportedCardIds.has(c.engineId))!.id
 const pack=(set:string)=>{opened.push(set);return {cards:[{id:sor('Leader'),type:'Leader',aspects:[]},{id:sor('Base'),type:'Base',aspects:[]},{id:sor('Unit'),type:'Unit'},{id:'unknown-card',name:'Mystery',type:'Unit'}]}}
 const small=await leeboPackWarsDeck({setCode:'SOR',packCount:2,participantId:'leebo-2',ownerUserId:'owner'},s,pack)
 assert.deepEqual(opened,['SOR','SOR'])
 assert.equal(small.cards.some(c=>c.id==='unknown-card'),false)
 assert.equal(small.snapshot.deck.reduce((n,c)=>n+c.count,0),2,'the other leader and base sit out; both units play')
 await assert.rejects(leeboPackWarsDeck({setCode:'SOR',packCount:2,participantId:'x',ownerUserId:'owner'},s,()=>({cards:[]})),e=>code(e)==='bot_deck_unavailable')
 await assert.rejects(leeboPackWarsDeck({setCode:'XYZ',packCount:2,participantId:'x',ownerUserId:'owner'},s,pack),e=>code(e)==='unsupported_set')
})
