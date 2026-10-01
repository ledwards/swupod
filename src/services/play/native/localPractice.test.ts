import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localPracticeEnabled, practiceDeck } from './localPractice'
import type { loadSupport } from './savedDeck'

test('self play requires explicit local development opt-in, never production', () => {
 const env = {NODE_ENV:'development',PTP_NATIVE_LOCAL_TESTING:'true',PTP_PUBLIC_ORIGIN:'http://localhost:3000'}
 assert.equal(localPracticeEnabled(env),true)
 assert.equal(localPracticeEnabled({...env,NODE_ENV:'production'}),false)
 assert.equal(localPracticeEnabled({...env,PTP_NATIVE_LOCAL_TESTING:'false'}),false)
 assert.equal(localPracticeEnabled({...env,PTP_PUBLIC_ORIGIN:'https://protectthepod.com'}),false)
})

test('older local builds still validate selected identities, types and deck size', () => {
 const cards = [{id:'l',engineId:'SOR_001',type:'Leader',rarity:'Rare'}, {id:'b',engineId:'SOR_020',type:'Base',rarity:'Common'}, {id:'u',engineId:'SOR_100',type:'Unit',rarity:'Common'}] as const
 const support = {catalog:new Map(cards.map(card=>[card.id,card])),policy:{supportedCardIds:new Set(cards.map(card=>card.engineId))}} as Awaited<ReturnType<typeof loadSupport>>
 const positions:Record<string,unknown> = {l:{card:{id:'l'}},b:{card:{id:'b'}},...Object.fromEntries(Array.from({length:30},(_,i)=>[`u${i}`,{section:'deck',card:{id:'u'}}]))}
 const state = {activeLeader:'l',activeBase:'b',cardPositions:positions}
 assert.deepEqual(practiceDeck(state,support),{leader:'SOR_001',base:'SOR_020',deck:[{id:'SOR_100',count:30}]})
 assert.throws(()=>practiceDeck({...state,activeLeader:'b'},support),{code:'invalid_selection'})
 assert.throws(()=>practiceDeck({...state,cardPositions:{...positions,u0:{section:'deck',card:{id:'unknown'}}}},support),{code:'unsupported_card'})
 delete positions.u0
 assert.throws(()=>practiceDeck(state,support),{code:'invalid_deck_size'})
})
