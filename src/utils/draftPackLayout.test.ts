import {test} from 'node:test'
import assert from 'node:assert/strict'
import {draftPackLayout} from './draftPackLayout'
test('a wide short panel uses the width instead of halving cards into a tiny cluster',()=>{
 const fit=draftPackLayout(1850,190,14)
 assert.equal(fit.rows,1)
 assert(fit.cardWidth>120)
})
test('two rows make cards bigger when the panel has enough height',()=>{
 const fit=draftPackLayout(1200,420,14)
 assert.equal(fit.rows,2)
 assert(fit.cardWidth>140)
 assert(fit.cardWidth*1.4*2+8<=420)
})
test('small packs remain a readable single row',()=>{
 const fit=draftPackLayout(1200,420,3)
 assert.equal(fit.rows,1)
 assert.equal(fit.cardWidth,220)
})
