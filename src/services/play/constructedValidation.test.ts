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
test('the report names every illegal card with a one-word reason, plus deck-level lines, in one answer',async()=>{
 const {validateConstructedReport}=await import('./constructedValidation')
 const suspended={id:'ASH_011',name:'Suspended One',type:'Unit',set:'ASH',released:true,premier:true}
 const old={id:'SOR_050',name:'Rotated',type:'Unit',set:'SOR',released:true,premier:false}
 const bad=deck();bad.deck[0]={id:'ASH_040',count:4};bad.deck.splice(1,2);bad.deck.push({id:'ASH_011',count:1},{id:'SOR_050',count:1},{id:'ZZZ_999',count:1});bad.sideboard=[{id:'ASH_043',count:1}]
 const report=validateConstructedReport(bad,'premier',[...catalog,suspended,old],{now:new Date('2026-10-07')})
 assert.equal(report.deck?.leader,'ASH_001')
 assert.deepEqual(report.problems.map(p=>[p.card,p.reason]),[
  ['Card 0','Count'],['Suspended One','Suspended'],['Rotated','Illegal'],['ZZZ_999','Unknown'],
  ['Card 3','Copies'],[null,null],
 ])
 assert.match(report.problems.at(-1)!.message,/at least 50/)
 // With the engine's inventory, unsupported cards join the list by name, mapped to their engine printing.
 const supported=new Set(catalog.map(c=>c.id).filter(id=>id!=='ASH_045'))
 const engine=validateConstructedReport(deck(),'premier',catalog,{},{engineIdOf:id=>id,supported})
 assert.deepEqual(engine.problems,[{card:'Card 5',reason:'Unsupported',message:'Card 5 is legal but not supported by this game engine yet.'}])
 assert.equal(validateConstructedReport(deck(),'premier',catalog,{},{engineIdOf:id=>id,supported:new Set(catalog.map(c=>c.id))}).problems.length,0)
 // A missing leader or base is reported, not thrown; a malformed export still fails at once.
 const noLeader=deck();noLeader.leader={id:'ZZZ_001',count:1};const missing=validateConstructedReport(noLeader,'premier',catalog)
 assert.equal(missing.deck,null);assert.deepEqual(missing.problems[0],{card:'ZZZ_001',reason:'Unknown',message:'ZZZ_001 is not a known card in this slot.'})
 assert.throws(()=>validateConstructedReport([],'premier',catalog),/JSON object/)
 assert.throws(()=>validateConstructed(bad,'premier',[...catalog,suspended,old],{now:new Date('2026-10-07')}),/Card 0: use a count/)
})
