import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setSoloAiStyleInTransaction } from './soloAi'
import { parseAiStyle, styleForPolicy, AI_STYLES, AI_STYLE_LABELS, AI_STYLE_POLICIES } from '../../src/services/play/solo/aiStyles'
import type { TxClient } from '../db'
function fixture({started=false,owned=true,aiPolicy='swu-ts3-b-v16'}={}) {
 const prepared={singleGame:true,aiPolicy,bot:{name:'Same opponent'},human:{deck:['same']}}
 const writes: unknown[][]=[]
 const tx={queryRow:async(sql:string,params:unknown[])=>{
  if(sql.includes('FOR UPDATE')) { assert.deepEqual(params,['run','owner']); assert.match(sql,/owner_user_id/); return owned?{prepared}:null }
  return started?{id:'started-game'}:null
 },query:async(...args:unknown[])=>{writes.push(args);return {rows:[]}}} as unknown as TxClient
 return {prepared,writes,tx}
}
test('selecting a thinking level preserves the frozen decks and changes only the saved policy',async()=>{
 const f=fixture(); await setSoloAiStyleInTransaction(f.tx,'run','owner','ultrathink')
 const params=f.writes[0]![1] as string[]
 assert.deepEqual(JSON.parse(params[1]!),{...f.prepared,aiPolicy:'swu-ts3-b-v16-ultrathink'})
})
test('level selection rejects another owner, started games and unknown levels',async()=>{
 await assert.rejects(setSoloAiStyleInTransaction(fixture({owned:false}).tx,'run','owner','thinking'),{code:'run_not_found'})
 const f=fixture({started:true})
 await assert.rejects(setSoloAiStyleInTransaction(f.tx,'run','owner','thinking'),{code:'style_locked'})
 assert.equal(f.writes.length,0)
 for(const invalid of ['full-info-cheat','random','ultra',null,'']) assert.throws(()=>parseAiStyle(invalid),{code:'invalid_ai_style'})
 assert.equal(parseAiStyle(undefined),'normal')
})
test('retrying the saved level is idempotent even after the game starts',async()=>{
 const f=fixture({started:true,aiPolicy:'swu-ts3-b-v16-thinking'}); await setSoloAiStyleInTransaction(f.tx,'run','owner','thinking'); assert.equal(f.writes.length,0)
 // A run saved before levels existed reads as Normal and keeps the budget it was prepared with.
 const legacy=fixture({started:true}); await setSoloAiStyleInTransaction(legacy.tx,'run','owner','normal'); assert.equal(legacy.writes.length,0)
})

test('the three levels are one model at three budgets, in order', () => {
 assert.deepEqual(AI_STYLES, ['normal','thinking','ultrathink'])
 assert.deepEqual(AI_STYLE_LABELS, {normal:'Normal', thinking:'Thinking', ultrathink:'Ultra-think'})
 assert.deepEqual(AI_STYLE_POLICIES, {normal:'swu-ts3-b-v16-normal', thinking:'swu-ts3-b-v16-thinking', ultrathink:'swu-ts3-b-v16-ultrathink'})
 for (const style of AI_STYLES) {
  assert.equal(parseAiStyle(style), style)
  assert.equal(styleForPolicy(AI_STYLE_POLICIES[style]), style)
 }
})

test('saved policies from before thinking levels read as Normal', () => {
 for (const policy of ['swu-ts3-b-v16','attn-meta-v12','policy-champion-v3','cal-aggro-v1','cal-aggro-v2','cal-control-v1','cal-control-v2','cal-balanced-v1','cal-balanced-v2','wip-search-v1'])
  assert.equal(styleForPolicy(policy),'normal')
})

test('retired style names from cached clients select Normal', () => {
 for (const value of [undefined, 'balanced', 'aggro', 'control'])
  assert.equal(AI_STYLE_POLICIES[parseAiStyle(value)], 'swu-ts3-b-v16-normal')
})
