import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateGameRecord,trainingExamples,normalizeRecordDeck,canonicalJson} from './gameRecords'
const deck={leader:'SOR_005',base:'SOR_029',cards:[{id:'SOR_040',count:30}]}
function fixture(){
 const identity={matchId:'game',issuer:'ptp',engineRevision:'revision',protocolVersion:1}
 const terminal={...identity,step:2,status:'complete',returns:[1,-1],reason:'concession'}
 return {schemaVersion:1,game:'swu',...identity,createdAtMs:100,setup:{decks:[deck,deck],seed:'18446744073709551615'},commands:[
  {seat:0,command:{commandId:'move',expectedStep:0,index:0,concede:false},action:{PlayCard:0},acceptedAtMs:101},
  {seat:1,command:{commandId:'concede',expectedStep:1,index:null,concede:true},action:null,acceptedAtMs:102}],
  frames:[0,1,2].map(step=>({step,views:[0,1].map(seat=>({...identity,step,seat,status:step===2?'complete':'in_progress',returns:step===2?[1,-1]:null,reason:step===2?'concession':null,to_move:step===2?null:0,observation:{player:seat,my_hand:[seat===0?'own-card':'opponent-secret']},events:[],...(seat===0&&step<2?{actions:['Play'],action_values:[{PlayCard:0}]}:{})}))})),terminal}
}
test('valid exact transport record accepts u64 string and nullable legacy timestamps',()=>{
 const value=fixture();assert.equal(validateGameRecord(value,'game','revision'),value)
 value.createdAtMs=null as any;value.commands.forEach(c=>c.acceptedAtMs=null as any)
 assert.doesNotThrow(()=>validateGameRecord(value,'game','revision'))
})
test('training examples use only mover observation and omit seed, opponent view and concessions',()=>{
 const examples=trainingExamples(validateGameRecord(fixture(),'game','revision'),'hash')
 assert.equal(examples.length,1);assert.equal(examples[0].reward,1);assert.deepEqual(examples[0].selectedAction,{PlayCard:0});assert.deepEqual(examples[0].legalActions,[{PlayCard:0}])
 const serialized=JSON.stringify(examples);assert.equal(serialized.includes('opponent-secret'),false);assert.equal(serialized.includes('18446744073709551615'),false);assert.equal(serialized.includes('setup'),false)
})
test('host deck snapshots and engine setup normalize identically regardless of ordering',()=>{
 const cards=[{id:'SOR_099',count:1},{id:'SOR_040',count:29}]
 assert.equal(canonicalJson(normalizeRecordDeck({...deck,cards})),canonicalJson(normalizeRecordDeck({leader:deck.leader,base:deck.base,deck:[...cards].reverse(),ownerUserId:'private'})))
 for(const cards of [[{id:'SOR_040',count:0}],[{id:'SOR_040',count:30},{id:'SOR_040',count:1}]])assert.throws(()=>normalizeRecordDeck({...deck,cards}))
})
test('forged actions, terminal fields, identities, seeds and concession shapes fail closed',()=>{
 const mutations:((r:any)=>void)[]=[r=>r.setup.seed='18446744073709551616',r=>r.setup.seed='-1',r=>r.setup.seed='1e3',r=>r.commands[0].action={PlayCard:1},r=>r.commands[0].command.index=2,r=>r.commands[1].command.commandId='move',r=>r.commands[1].command.index=0,r=>r.commands[1].action='Pass',r=>r.terminal.reason='rules',r=>r.frames[0].views[0].observation.player=1,r=>r.frames[0].views[0].events=[{step:1}],r=>r.terminal.returns=[-1,1],r=>r.frames[2].views[1].returns=[0,0],r=>r.commands[0].acceptedAtMs=-1,r=>r.engineRevision='other']
 for(const mutate of mutations){const value=fixture();mutate(value);assert.throws(()=>validateGameRecord(value,'game','revision'))}
})
function undoFixture(){
 const r:any=fixture();r.setup.bots=[null,'cal-aggro-v1'];
 r.commands.splice(1,0,{seat:0,command:{commandId:'undo',expectedStep:1,index:null,concede:false,undoTo:0},action:null,acceptedAtMs:102});
 r.commands[2].command.expectedStep=2;r.terminal.step=3;
 r.frames.splice(1,0,structuredClone(r.frames[0]));
 r.frames.forEach((f:any,i:number)=>{f.step=i;f.views.forEach((v:any)=>v.step=i)});
 return r;
}
test('undo records validate and reverted actions are excluded from training',()=>{
 const r=undoFixture();assert.equal(validateGameRecord(r,'game','revision'),r);
 assert.deepEqual(trainingExamples(r,'hash'),[]);
});
test('invalid undo targets, seats and mixed commands fail closed',()=>{
 for(const mutate of [(r:any)=>r.commands[1].command.undoTo=1,(r:any)=>r.commands[1].command.undoTo=-1,(r:any)=>r.commands[1].command.index=0,(r:any)=>r.commands[1].command.concede=true,(r:any)=>r.commands[1].seat=1,(r:any)=>r.setup.bots=[null,null]]){
  const r=undoFixture();mutate(r);assert.throws(()=>validateGameRecord(r,'game','revision'));
 }
});
