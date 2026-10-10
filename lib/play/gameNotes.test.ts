import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {authorizeNotesExport,canAddGameNotes,validateGameNote} from './gameNotes'

test('game notes are limited to admins and alpha testers, matching native play access',()=>{
 assert.equal(canAddGameNotes({is_admin:true}),true)
 assert.equal(canAddGameNotes({is_alpha_tester:true}),true)
 assert.equal(canAddGameNotes({is_beta_tester:true}),false)
 assert.equal(canAddGameNotes({is_patron:true}),false)
 assert.equal(canAddGameNotes({}),false)
 assert.equal(canAddGameNotes(null),false)
})

function input(){
 const matchId=randomUUID()
 return {id:randomUUID(),subject:randomUUID(),matchId,seat:1,step:4,entryIndex:0,text:'  Target looked wrong  ',engineRevision:'pinned',
  snapshot:{issuer:'ptp',matchId,seat:1,step:4,engineRevision:'pinned',observation:{my_hand:[]}}}
}

test('validateGameNote trims text and keeps the frozen step and seat',()=>{
 const raw=input(),note=validateGameNote(raw)
 assert.equal(note.text,'Target looked wrong')
 assert.equal(note.step,4)
 assert.equal(note.seat,1)
 assert.equal(note.matchId,raw.matchId)
 assert.deepEqual(note.snapshot,raw.snapshot)
})

test('validateGameNote rejects malformed notes and snapshots that do not match the note',()=>{
 const raw=input()
 const bad:Record<string,unknown>[]=[
  {text:'   '},{text:'x'.repeat(2001)},{step:0},{step:20002},{step:1.5},{seat:2},{seat:'1'},{entryIndex:-1},{entryIndex:1001},
  {matchId:'bad id!'},{engineRevision:''},{engineRevision:'x'.repeat(101)},{id:'not-a-uuid'},{subject:'nope'},
  {snapshot:null},{snapshot:{...raw.snapshot,seat:0}},{snapshot:{...raw.snapshot,step:5}},{snapshot:{...raw.snapshot,issuer:'other'}},
  {snapshot:{...raw.snapshot,matchId:'other'}},{snapshot:{...raw.snapshot,engineRevision:'other'}},{snapshot:{...raw.snapshot,observation:null}},
 ]
 for(const changes of bad)assert.throws(()=>validateGameNote({...raw,...changes}),(error:{status?:number})=>error.status===400,JSON.stringify(changes))
})

test('note export requires the dedicated read key and fails closed as not found',()=>{
 const original=process.env.GAME_NOTES_READ_KEY
 try{
  delete process.env.GAME_NOTES_READ_KEY
  assert.throws(()=>authorizeNotesExport(new Request('http://local/export',{headers:{authorization:'Bearer '+'r'.repeat(40)}})),{status:404})
  process.env.GAME_NOTES_READ_KEY='short'
  assert.throws(()=>authorizeNotesExport(new Request('http://local/export',{headers:{authorization:'Bearer short'}})),{status:404})
  process.env.GAME_NOTES_READ_KEY='r'.repeat(40)
  assert.throws(()=>authorizeNotesExport(new Request('http://local/export')),{status:404})
  assert.throws(()=>authorizeNotesExport(new Request('http://local/export',{headers:{authorization:'Bearer '+'w'.repeat(40)}})),{status:404})
  authorizeNotesExport(new Request('http://local/export',{headers:{authorization:'Bearer '+'r'.repeat(40)}}))
 }finally{if(original===undefined)delete process.env.GAME_NOTES_READ_KEY;else process.env.GAME_NOTES_READ_KEY=original}
})
