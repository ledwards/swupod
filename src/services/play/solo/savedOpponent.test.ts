import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedOpponentSnapshot } from './savedOpponent'
import type { loadSupport } from '../native/savedDeck'
const cards = [{id:'l',engineId:'HMW_001',type:'Leader',rarity:'Rare'}, {id:'b',engineId:'HMW_020',type:'Base',rarity:'Common'}, {id:'u',engineId:'HMW_100',type:'Unit',rarity:'Common'}] as const
const support = {catalog:new Map(cards.map(c=>[c.id,c])), policy:{version:'test',supportedSets:new Set(['HMW']),supportedCardIds:new Set(cards.map(c=>c.engineId))}} as Awaited<ReturnType<typeof loadSupport>>
function pool() {
 return {id:'pool',share_id:'saved',user_id:'owner',pool_type:'sealed',set_code:'HMW',packs:Array(6).fill({}),deck_builder_state:{activeLeader:'l',activeBase:'b',cardPositions:{l:{card:{id:'l'}},b:{card:{id:'b'}},...Object.fromEntries(Array.from({length:30},(_,i)=>[`u${i}`,{section:'deck',card:{id:'u'}}]))}}}
}
test('complete legacy builds can be AI opponents without claiming verified pool evidence',()=>{
 const result=savedOpponentSnapshot(pool(),'owner',support)
 assert.equal(result.provenance,'saved-practice')
 assert.equal(result.deck[0]?.count,30)
 assert.equal(result.contentHash,savedOpponentSnapshot(pool(),'owner',support).contentHash)
})
test('saved AI opponents still require ownership, supported cards, and a complete deck',()=>{
 assert.throws(()=>savedOpponentSnapshot(pool(),'another',support),{code:'deck_not_found'})
 const short=pool();delete short.deck_builder_state.cardPositions.u0
 assert.throws(()=>savedOpponentSnapshot(short,'owner',support),{code:'invalid_deck_size'})
 assert.throws(()=>savedOpponentSnapshot({...pool(),set_code:'UNKNOWN'},'owner',support),{code:'unsupported_set'})
 const unknown=pool();unknown.deck_builder_state.cardPositions.l.card.id='unknown'
 assert.throws(()=>savedOpponentSnapshot(unknown,'owner',support),{code:'unsupported_card'})
})
