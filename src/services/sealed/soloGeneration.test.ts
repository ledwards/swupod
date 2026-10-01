import { it } from 'node:test'
import assert from 'node:assert/strict'
import { validatePrepare, selectWindow, finalizeSoloGeneration, prepareSoloGeneration } from './soloGeneration'
import type { TxClient } from '../../../lib/db'
const requestId = 'cae10122-a700-4000-8000-000000000001'
it('accepts only supported single sets, supported carbonite variants and six/eight packs', () => {
  assert.deepEqual(validatePrepare({setCode:'SOR',packCount:6,requestId},{}),{setCode:'SOR',packCount:6,requestId})
  assert.equal(validatePrepare({setCode:'JTL-CB',packCount:8,requestId},{}).setCode,'JTL-CB')
  for(const change of [{packCount:7},{packCount:'8'},{setCode:'SOR-CB'},{setCode:'SOR,SHD'},{setCode:'UNKNOWN'},{cards:[]},{boxPacks:[]}]) assert.throws(()=>validatePrepare({setCode:'SOR',packCount:6,requestId,...change},{}))
})
it('derives exactly a consecutive server-owned window and rejects invalid indices',()=>{
  const box=Array.from({length:24},(_,i)=>({cards:[{id:`server-${i}`}]}))
  assert.deepEqual(selectWindow(box,8,16).cards.map(c=>c.id),Array.from({length:8},(_,i)=>`server-${16+i}`))
  for(const start of [-1,17,1.5,NaN])assert.throws(()=>selectWindow(box,8,start))
})
it('finalization authorizes owner and inserts pool/evidence from server artifact only',async()=>{
  const calls:{sql:string,params:unknown[]}[]=[]
  const box=Array.from({length:24},(_,i)=>({cards:[{id:`server-${i}`}]}))
  const rows=[{id:requestId,share_id:'trusted',owner_user_id:'owner',set_code:'SOR',pack_count:6,box_packs:box,expires_at:new Date(Date.now()+60000)},null]
  const tx:TxClient={queryRow:async()=>rows.shift()??null,queryRows:async()=>[],query:async(sql,params=[])=>{calls.push({sql,params});return {rows:[],rowCount:1,command:'',fields:[]}}}
  const result=await finalizeSoloGeneration(tx,'owner',{generationId:requestId,windowStart:3})
  assert.equal(result.shareId,'trusted');assert.deepEqual(result.cards.map(c=>c.id),['server-3','server-4','server-5','server-6','server-7','server-8'])
  const evidence=calls.find(c=>c.sql.includes('INSERT INTO ptp_native_pool_evidence'))!
  assert.equal(evidence.params[1],'owner');assert.equal(evidence.params[3],6);assert.deepEqual(JSON.parse(String(evidence.params[4])),result.cards)
  await assert.rejects(finalizeSoloGeneration({...tx,queryRow:async()=>null},'intruder',{generationId:requestId,windowStart:3}),{status:404})
  await assert.rejects(finalizeSoloGeneration(tx,'owner',{generationId:requestId,windowStart:3,cards:[{id:'forged'}]}),{status:400})
})
it('finalization retries are stable and cannot replace the first certified window',async()=>{
  const box=Array.from({length:24},(_,i)=>({cards:[{id:`server-${i}`}]}))
  const artifact={id:requestId,share_id:'trusted',set_code:'SOR',pack_count:6,box_packs:box,expires_at:new Date(0)}
  function tx():TxClient { const rows=[artifact,{share_id:'trusted',cards:box.slice(0,6).flatMap(p=>p.cards)}];return {queryRow:async()=>rows.shift()??null,queryRows:async()=>[],query:async()=>{throw new Error('A retry must not mutate evidence')}} }
  assert.equal((await finalizeSoloGeneration(tx(),'owner',{generationId:requestId,windowStart:0})).shareId,'trusted')
  await assert.rejects(finalizeSoloGeneration(tx(),'owner',{generationId:requestId,windowStart:1}),{status:409})
})
it('expired unfinalized boxes cannot become native evidence',async()=>{
  const tx:TxClient={queryRow:async(sql)=>sql.includes('generations')?{id:requestId,box_packs:Array.from({length:24},()=>({cards:[]})),pack_count:6,expires_at:new Date(0)}:null,queryRows:async()=>[],query:async()=>{throw new Error('Expired artifact must not write')}}
  await assert.rejects(finalizeSoloGeneration(tx,'owner',{generationId:requestId,windowStart:0}),{status:410})
})

it('uses the real standard and Carbonite box generators while storing exact server output',async()=>{
  for(const [setCode,packCount] of [['SOR',6],['JTL-CB',8]] as const){
    let stored:Record<string,unknown>|null=null
    const tx:TxClient={queryRow:async(sql,params=[])=>{
      if(sql.startsWith('INSERT INTO')){stored={id:params[0],owner_user_id:params[1],request_id:params[2],share_id:params[3],set_code:params[4],pack_count:params[5],box_packs:JSON.parse(String(params[6]))};return stored}
      return sql.includes('COUNT(*)')?{count:0}:null
    },query:async()=>({rows:[],rowCount:0,command:'',fields:[]}),queryRows:async()=>[]}
    const result=await prepareSoloGeneration(tx,'owner',{setCode,packCount,requestId},{})
    assert.equal(result.boxPacks.length,24);assert.equal(result.packs.length,packCount)
    assert.equal(result.setCode,setCode);assert.ok(result.cards.length>0)
    assert.deepEqual(result.boxPacks,stored!.box_packs)
  }
})
