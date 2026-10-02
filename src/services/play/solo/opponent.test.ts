import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chooseDraftOpponent,buildSoloOpponent,type PreparedSolo} from './opponent'
import {constructBotDeck} from '../../../utils/botDeckConstruction'
import {getCardsBySet} from '../../../utils/cardData'

test('solo opening uses the actual opposite seat and rejects group/incomplete drafts',()=>{
 const rows=Array.from({length:8},(_,i)=>({id:`seat-${i+1}`,seat_number:i+1,is_bot:i!==2}))
 assert.equal(chooseDraftOpponent(rows,3).id,'seat-7')
 assert.throws(()=>chooseDraftOpponent(rows.slice(1),3),{code:'unsupported_solo_draft'})
 assert.throws(()=>chooseDraftOpponent(rows.map(r=>({...r,is_bot:false})),3),{code:'unsupported_solo_draft'})
 assert.throws(()=>chooseDraftOpponent(rows.map(r=>({...r,seat_number:3})),3),{code:'invalid_draft_seats'})
})
test('construction preserves the supplied pool and never invents main-deck cards',()=>{
 const cards=getCardsBySet('SOR').filter(c=>c.variantType==='Normal')
 const leaders=cards.filter(c=>c.isLeader).slice(0,3)
 const main=cards.filter(c=>['Unit','Upgrade','Event'].includes(c.type)).slice(0,60)
 const input={drafted_leaders:leaders,drafted_cards:main,strategy_name:'allPlayer',mixin_name:'highConviction'}
 const before=JSON.stringify(input),result=constructBotDeck(input,'SOR')
 assert.ok(result)
 assert.equal(result.deckCards.length,30)
 assert.equal(JSON.stringify(input),before)
 const available=new Map(main.map(c=>[c.id,1]))
 for(const card of result.deckCards){assert.ok((available.get(card.id)??0)>0);available.set(card.id,available.get(card.id)!-1)}
 assert.ok(leaders.some(c=>c.id===result.selectedLeader.id))
 assert.equal(result.selectedBase.rarity,'Common')
 assert.equal(result.mixinName,'highConviction')
 assert.equal(constructBotDeck({...input,drafted_leaders:[]},'SOR'),null)
})

test('a frozen preparation cannot silently switch deck-builder versions',()=>{
 assert.throws(()=>buildSoloOpponent('run',{builderVersion:'other-version'} as PreparedSolo,{} as any),{code:'builder_version'})
})
