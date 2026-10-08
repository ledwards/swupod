import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateCosmeticLoadout,type CosmeticCatalog} from './eventCosmetics'
const catalog:CosmeticCatalog={version:1,revision:'r1',items:[{id:'mat-a',kind:'mat',name:'Mat',available:true,image:'https://example.test/mat.png',sourceUrl:'https://example.test/prizes',events:[]},{id:'sleeve-b',kind:'sleeve',name:'Sleeve',available:true,image:'https://example.test/sleeve.png',sourceUrl:'https://example.test/prizes',events:[]}]}
const access={beta:true,supporter:false,status:'ready',allowedItemIds:['mat-a'],catalogRevision:'r1',expiresAt:Date.now()+60000}
test('an attendee can use only their granted item in the right slot',()=>{
 assert.deepEqual(validateCosmeticLoadout({mat:'mat-a'},catalog,access),{mat:'mat-a'})
 for(const invalid of [{sleeve:'mat-a'},{sleeve:'sleeve-b'},{mat:'missing'},{other:'mat-a'}])assert.throws(()=>validateCosmeticLoadout(invalid,catalog,access))
})
test('supporters bypass attendance; expiry, catalog changes and beta denial remain distinct',()=>{
 assert.deepEqual(validateCosmeticLoadout({sleeve:'sleeve-b'},catalog,{...access,supporter:true,status:'unavailable',allowedItemIds:[]}),{sleeve:'sleeve-b'})
 for(const patch of [{expiresAt:0},{catalogRevision:'old'},{beta:false}])assert.throws(()=>validateCosmeticLoadout({mat:'mat-a'},catalog,{...access,...patch}))
 assert.deepEqual(validateCosmeticLoadout({},catalog,{...access,expiresAt:0}),{})
})
