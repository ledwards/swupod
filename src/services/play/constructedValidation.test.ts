import test from 'node:test'
import assert from 'node:assert/strict'
import {validateConstructed,suspendedIds,type LegalityCard} from './constructedValidation'
const catalog:LegalityCard[]=[{id:'ASH_001',name:'Leader',type:'Leader',set:'ASH',released:true,premier:true},{id:'ASH_020',name:'Base',type:'Base',set:'ASH',released:true,premier:true},...Array.from({length:20},(_,i)=>({id:`ASH_${String(i+40).padStart(3,'0')}`,name:`Card ${i}`,type:'Unit',set:'ASH',released:true,premier:true}))]
const deck=()=>({leader:{id:'ASH_001',count:1},base:{id:'ASH_020',count:1},deck:catalog.slice(2,19).map(c=>({id:c.id,count:3})),sideboard:[] as {id:string;count:number}[]})
test('constructed size, leader/base counts, sideboard roles and combined reprint copies',()=>{
 assert.equal(validateConstructed(deck(),'premier',catalog).cards.length,17)
 const short=deck();short.deck.pop();assert.throws(()=>validateConstructed(short,'premier',catalog),/at least 50/)
 const duplicate=deck();duplicate.sideboard=[{id:'ASH_040',count:1}];assert.throws(()=>validateConstructed(duplicate,'premier',catalog),/across/)
 const leader=deck();leader.leader.count=2;assert.throws(()=>validateConstructed(leader,'premier',catalog),/exactly one/)
 const wrong=deck();wrong.sideboard=[{id:'ASH_001',count:1}];assert.throws(()=>validateConstructed(wrong,'premier',catalog),/slot/)
 const reprint={...catalog[2]!,id:'SOR_040',set:'SOR',premier:false};const printed=deck();printed.deck[0]={id:'SOR_040',count:3};assert.doesNotThrow(()=>validateConstructed(printed,'premier',[...catalog,reprint]))
 printed.sideboard=[{id:'ASH_040',count:1}];assert.throws(()=>validateConstructed(printed,'premier',[...catalog,reprint]),/reprints/)
})
test('rotation, unreleased cards, placeholders and independent suspension policies',()=>{
 const old=catalog.map(c=>({...c,premier:false}));assert.throws(()=>validateConstructed(deck(),'premier',old),/not legal/);assert.doesNotThrow(()=>validateConstructed(deck(),'eternal',old))
 assert.throws(()=>validateConstructed(deck(),'eternal',catalog.map(c=>({...c,released:false}))),/not legal/)
 assert.throws(()=>validateConstructed(deck(),'eternal',catalog.map(c=>({...c,placeholder:true}))),/known/)
 assert.deepEqual(suspendedIds('eternal',new Date('2026-10-07')),['JTL_170','JTL_140'])
 assert.deepEqual(suspendedIds('eternal',new Date('2026-10-09'),true),[])
 assert.ok(suspendedIds('premier',new Date('2026-10-07')).includes('ASH_011'))
})
