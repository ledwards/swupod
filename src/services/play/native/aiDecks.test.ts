import {test} from 'node:test'
import assert from 'node:assert/strict'
import {AI_DECKS,aiDeck,aiDeckOptions,checkAiDeck,leeboPoolDeck,legality} from './aiDecks'
import {resolveOpponent} from './sharedPlay'
import {loadSupport} from './savedDeck'
import {cardCatalog} from '../cardPool'
import {queueContract} from '../formats'
import {PtpPlayError} from '../playState'

const now=new Date()
const support=loadSupport('data/native-support/all.json')
const code=(e:unknown)=>e instanceof PtpPlayError?e.code:String(e)

test('every catalogue deck is legal somewhere today and fully engine supported; Premier has a strong default',async()=>{
 const s=await support,catalog=cardCatalog(now)
 assert.ok(AI_DECKS.length>=6)
 assert.equal(new Set(AI_DECKS.map(d=>d.id)).size,AI_DECKS.length)
 for(const d of AI_DECKS){
  assert.ok(d.name&&d.leader&&d.base,d.id)
  assert.ok(d.deck.reduce((n,c)=>n+c.count,0)>=50,d.id)
  assert.ok((['premier','eternal'] as const).some(f=>checkAiDeck(d,f,catalog,s.policy.supportedCardIds,legality(now))),`${d.id} is not playable`)
 }
 const options=aiDeckOptions('test',()=>catalog,s.policy.supportedCardIds,legality(now))
 assert.ok(options.some(o=>o.formats.includes('premier')))
 assert.ok(options.every(o=>o.formats.includes('eternal')),'Premier-legal decks are Eternal-legal')
 assert.ok(!('deck' in options[0]!),'the lobby state never ships decklists')
})

test('a preset resolves to a validated deck; unknown and out-of-format presets are refused',async()=>{
 const s=await support,catalog=cardCatalog(now),options=aiDeckOptions('test',()=>catalog,s.policy.supportedCardIds,legality(now))
 const premier=options.find(o=>o.formats.includes('premier'))!
 const deck=aiDeck(premier.id,'premier',catalog,s.policy.supportedCardIds,legality(now))
 assert.equal(deck.leader,premier.leader)
 assert.throws(()=>aiDeck('nope','premier',catalog,s.policy.supportedCardIds,legality(now)),e=>code(e)==='ai_deck_not_found')
 const eternalOnly=options.find(o=>!o.formats.includes('premier'))
 if(eternalOnly)assert.throws(()=>aiDeck(eternalOnly.id,'premier',catalog,s.policy.supportedCardIds,legality(now)),e=>code(e)==='ai_deck_unavailable')
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
