import test from 'node:test'
import assert from 'node:assert/strict'
import {cardCatalog,currentPolicy,currentPoolSets} from './cardPool'
import {validateConstructed} from './constructedValidation'
import {getKarabastCardPool} from '../../utils/setConfigs/latest'

// Current matches Karabast: a set joins the pool on retail release day (HMW: 2026-10-09), not at prerelease.
const before=new Date('2026-10-08T23:59:59.999Z')
const release=new Date('2026-10-09T00:00:00.000Z')
test('Homeworlds enters Current on release day, including limited sets and queue policy',()=>{
 assert.equal(currentPoolSets(before).some(c=>c.setCode==='HMW'),false)
 assert.equal(currentPoolSets(new Date('2026-10-02')).some(c=>c.setCode==='HMW'),false,'prerelease does not advance Current')
 assert.equal(currentPoolSets(release)[0].setCode,'HMW')
 assert.notEqual(currentPolicy(before),currentPolicy(release))
 assert.equal(currentPolicy(release),currentPolicy(new Date('2026-10-20')))
 assert.equal(getKarabastCardPool('HMW',before),'Next Set')
 assert.equal(getKarabastCardPool('HMW',release),'Current')
})
test('Victor Squadron is legal in Premier and Eternal from release day onward',()=>{
 const catalog=cardCatalog(release)
 const victor=catalog.find(c=>c.id==='HMW_203')!
 assert.equal(victor.name,'Victor Squadron')
 const units=catalog.filter(c=>c.set==='ASH'&&c.type==='Unit'&&!c.placeholder).filter((c,i,all)=>all.findIndex(other=>other.name===c.name&&other.subtitle===c.subtitle)===i).slice(0,16)
 const deck={leader:'ASH_001',base:'ASH_020',deck:[...units.map(c=>({id:c.id,count:3})),{id:'HMW_203',count:3}]}
 for(const format of ['premier','eternal'] as const){
  assert.throws(()=>validateConstructed(deck,format,cardCatalog(before),{now:before}),/Victor Squadron is not legal/)
  for(const now of [release,new Date('2026-10-20')])assert.doesNotThrow(()=>validateConstructed(deck,format,cardCatalog(now),{now}))
 }
})

test('SWUForge Obi-Wan Yellow accepts Watch This in its sideboard without making Hoth a limited set',async()=>{
 const {default:deck}=await import('./fixtures/obi-wan-yellow.json')
 const {loadSupport}=await import('./native/savedDeck')
 const {engineIdLookup,toEngineDeck}=await import('./constructedValidation')
 const catalog=cardCatalog(release),support=await loadSupport('data/native-support/all.json')
 assert.equal(catalog.find(c=>c.id==='IBH_052')?.name,'Watch This')
 assert.equal(catalog.filter(c=>c.set==='IBH').length,104)
 assert.equal(currentPoolSets(release).some(c=>String(c.setCode)==='IBH'),false)
 assert.equal(cardCatalog(new Date('2025-10-02')).find(c=>c.id==='IBH_052')?.released,false)
 for(const format of ['premier','eternal'] as const){
  const result=toEngineDeck(validateConstructed(deck,format,catalog,{now:release}),engineIdLookup(catalog,id=>support.catalog.get(id)?.engineId))
  assert.deepEqual(result.sideboard.find(c=>c.id==='IBH_052'),{id:'IBH_052',count:2})
  for(const c of [...result.cards,...result.sideboard])assert.ok(support.policy.supportedCardIds.has(c.id),c.id)
 }
 const invalid=structuredClone(deck);invalid.sideboard[0].id='IBH_999'
 assert.throws(()=>validateConstructed(invalid,'premier',catalog,{now:release}),/IBH_999 is not a known card/)
})
test('2026 Twin Suns (TS26) is legal in Eternal, never in Premier, and never a limited set',async()=>{
 const {default:deck}=await import('./fixtures/anakin-ts26-data-vault.json')
 const {loadSupport}=await import('./native/savedDeck')
 const {engineIdLookup,toEngineDeck}=await import('./constructedValidation')
 const catalog=cardCatalog(release),support=await loadSupport('data/native-support/all.json')
 assert.equal(catalog.filter(c=>c.set==='TS26').length,84,'tokens never enter a deck')
 assert.deepEqual(catalog.find(c=>c.id==='TS26_002'),{...catalog.find(c=>c.id==='TS26_002'),name:'Anakin Skywalker',set:'TS26',released:true,premier:false})
 assert.equal(currentPoolSets(release).some(c=>String(c.setCode)==='TS26'),false)
 // A four-letter set code is a card ID like any other.
 const result=toEngineDeck(validateConstructed(deck,'eternal',catalog,{now:release}),engineIdLookup(catalog,id=>support.catalog.get(id)?.engineId))
 assert.equal(result.leader,'TS26_002')
 for(const c of [result.leader,result.base,...result.cards.map(c=>c.id)])assert.ok(support.policy.supportedCardIds.has(c),c)
 assert.throws(()=>validateConstructed(deck,'premier',catalog,{now:release}),/Anakin Skywalker is not legal in Premier/)
})
