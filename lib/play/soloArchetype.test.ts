import {test} from 'node:test'
import assert from 'node:assert/strict'
import {soloArchetypeName} from './soloArchetype'
test('archetypes use deck-aware canonical API names and cache identical requests',async t=>{
 let requests=0
 t.mock.method(globalThis,'fetch',async (url:URL)=>{requests++;assert.equal(url.searchParams.get('format'),'Limited');assert.equal(url.searchParams.get('deck_card_uuids'),'a,b');return Response.json({nickname:'Warrior Tatooine Green 30'})})
 assert.equal(await soloArchetypeName('leader','base',['b','a','b']),'Warrior Tatooine Green 30')
 assert.equal(await soloArchetypeName('leader','base',['a','b']),'Warrior Tatooine Green 30')
 assert.equal(requests,1)
})
test('archetype lookup failure does not prevent showing tournament results',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('offline')})
 assert.equal(await soloArchetypeName('other','base',[]),null)
})
