import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setSoloAiStyleInTransaction } from './soloAi'
import { parseAiStyle, styleForPolicy, AI_STYLE_POLICIES } from '../../src/services/play/solo/aiStyles'
import type { TxClient } from '../db'
function fixture({started=false,owned=true}={}) {
 const prepared={singleGame:true,aiPolicy:'cal-balanced-v1',bot:{name:'Same opponent'},human:{deck:['same']}}
 const writes: unknown[][]=[]
 const tx={queryRow:async(sql:string,params:unknown[])=>{
  if(sql.includes('FOR UPDATE')) { assert.deepEqual(params,['run','owner']); assert.match(sql,/owner_user_id/); return owned?{prepared}:null }
  return started?{id:'started-game'}:null
 },query:async(...args:unknown[])=>{writes.push(args);return {rows:[]}}} as unknown as TxClient
 return {prepared,writes,tx}
}
test('selecting a style preserves the frozen decks and changes only the saved policy',async()=>{
 const f=fixture(); await setSoloAiStyleInTransaction(f.tx,'run','owner','aggro')
 const params=f.writes[0]![1] as string[]
 assert.deepEqual(JSON.parse(params[1]!),{...f.prepared,aiPolicy:AI_STYLE_POLICIES.aggro})
})
test('style selection rejects another owner, started games and unknown styles',async()=>{
 await assert.rejects(setSoloAiStyleInTransaction(fixture({owned:false}).tx,'run','owner','control'),{code:'run_not_found'})
 const f=fixture({started:true})
 await assert.rejects(setSoloAiStyleInTransaction(f.tx,'run','owner','control'),{code:'style_locked'})
 assert.equal(f.writes.length,0)
 for(const invalid of ['full-info-cheat','random',null,'']) assert.throws(()=>parseAiStyle(invalid),{code:'invalid_ai_style'})
 assert.equal(parseAiStyle(undefined),'balanced')
})
test('retrying the saved style is idempotent even after the game starts',async()=>{
 const f=fixture({started:true}); await setSoloAiStyleInTransaction(f.tx,'run','owner','balanced'); assert.equal(f.writes.length,0)
})

test('new styles select the champion and saved v1 styles retain their labels', () => {
 assert.deepEqual(AI_STYLE_POLICIES, {aggro:'cal-aggro-v2', balanced:'cal-balanced-v2', control:'cal-control-v2'})
 for (const version of ['v1','v2']) {
  assert.equal(styleForPolicy(`cal-aggro-${version}`),'aggro')
  assert.equal(styleForPolicy(`cal-control-${version}`),'control')
  assert.equal(styleForPolicy(`cal-balanced-${version}`),'balanced')
 }
})
