import test from 'node:test'
import assert from 'node:assert/strict'
import {validateConstructed,toEngineDeck,engineIdLookup} from '../constructedValidation'
import {cardCatalog} from '../cardPool'
import {loadSupport} from './savedDeck'
import {legality} from './aiDecks'

// Lee's "Obi-Wan Yellow - Copy" from SWUForge: Obi-Wan Kenobi (Courage Makes Heroes) on Crystal Caves, in Hyperspace
// and Showcase printings. Legal in Premier by card identity, but the engine-support check compared the printing's own
// collector ID (LOF_272, LOF_293, ...) with the manifest, which lists only standard printings: "Not valid".
test('Hyperspace and Showcase printings validate and play as their standard engine IDs (Obi-Wan / Crystal Caves)',async()=>{
 const now=new Date('2026-10-12T12:00:00Z'),catalog=cardCatalog(now),support=await loadSupport('data/native-support/all.json')
 const ids=support.policy.supportedCardIds,engineOf=engineIdLookup(catalog,id=>support.catalog.get(id)?.engineId)
 // Seventeen Premier-legal LOF units, each as a printing whose own ID the engine does not list.
 const seen=new Set<string>(),picks:string[]=[]
 for(const c of catalog)if(c.set==='LOF'&&c.type==='Unit'&&c.premier&&!ids.has(c.id)&&ids.has(engineOf(c.id)??'')&&!seen.has(c.name+c.subtitle)&&picks.length<17){seen.add(c.name+c.subtitle);picks.push(c.id)}
 assert.equal(picks.length,17)
 const deck={leader:{id:'LOF_272',count:1},base:{id:'LOF_293',count:1},deck:picks.map((id,i)=>({id,count:i===16?2:3})),sideboard:[]}
 for(const id of ['LOF_272','LOF_293',...picks])assert.equal(ids.has(id),false,`${id} is a printing the manifest does not list`)
 const valid=validateConstructed(deck,'premier',catalog,legality(now))
 const engine=toEngineDeck(valid,engineOf)
 assert.equal(engine.leader,'LOF_008');assert.equal(engine.base,'LOF_029')
 assert.equal(engine.cards.reduce((n,c)=>n+c.count,0),50)
 for(const id of [engine.leader,engine.base,...engine.cards.map(c=>c.id)])assert.ok(ids.has(id),`${id} is supported`)
})
test('an invalid deck reports every problem, one terse line each',()=>{
 const now=new Date('2026-10-12T12:00:00Z'),catalog=cardCatalog(now)
 const units=catalog.filter(c=>c.set==='LOF'&&c.type==='Unit'&&c.premier)
 const old=catalog.find(c=>c.set==='SOR'&&c.type==='Unit'&&!catalog.some(o=>o.premier&&o.name===c.name&&o.subtitle===c.subtitle))!
 const deck={leader:{id:'LOF_008',count:1},base:{id:'LOF_029',count:1},deck:[{id:units[0]!.id,count:3},{id:old.id,count:1}],sideboard:[{id:units[0]!.id,count:1}]}
 assert.throws(()=>validateConstructed(deck,'premier',catalog,legality(now)),(e:Error)=>{
  const lines=e.message.split('\n')
  assert.ok(lines.includes(`${old.name} is not legal in Premier · Current.`),e.message)
  assert.ok(lines.includes(`4 copies of ${units[0]!.name} (max 3 across the main deck and sideboard, including reprints).`),e.message)
  assert.ok(lines.some(l=>/at least 50 main-deck cards; you have 4/.test(l)),e.message)
  return true
 })
})
