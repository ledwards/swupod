import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sideboardErrors, selectionFromDeck, type SideboardCard } from './sideboard'
const cards: SideboardCard[] = [
 { id: 'leader', engineId: 'SOR_001', name: 'Leader', type: 'Leader', count: 1, supported: true },
 { id: 'base', engineId: 'SOR_020', name: 'Base', type: 'Base', count: 1, supported: true },
 { id: 'unit', engineId: 'SOR_100', name: 'Unit', type: 'Unit', count: 35, supported: true },
]
const selection = { leader: 'leader', base: 'base', deck: { unit: 30 } }
test('limited sideboarding accepts 30+ cards and a leader and base', () => {
 assert.deepEqual(sideboardErrors(selection, cards), [])
 assert.deepEqual(sideboardErrors({...selection, deck:{unit:35}}, cards), [])
 assert.match(sideboardErrors({...selection, deck:{unit:29}}, cards).join(' '), /30/)
 for (const key of ['leader','base']) assert.ok(sideboardErrors({...selection,[key]:''},cards).length)
})
test('sideboarding rejects outside-pool cards, extra copies, malformed counts and card types', () => {
 for (const deck of [{unit:36},{unit:30,other:1},{unit:30.5},{unit:-1},{unit:NaN},{leader:30}])
  assert.ok(sideboardErrors({...selection,deck},cards).length)
 assert.ok(sideboardErrors({...selection,leader:'unit'},cards).length)
 assert.ok(sideboardErrors(selection,cards.map(c=>({...c,supported:false}))).length)
})
test('base deckbuilding restrictions apply during sideboarding', () => {
 const changed = cards.map(c=>c.type==='Base'?{...c,engineId:'JTL_024'}:c)
 assert.match(sideboardErrors(selection,changed).join(' '), /40/)
 assert.deepEqual(sideboardErrors({...selection,deck:{unit:25}},cards.map(c=>c.type==='Base'?{...c,engineId:'JTL_025'}:c)),[])
})
test('saved game deck maps engine identities back to available pool cards', () => {
 assert.deepEqual(selectionFromDeck({leader:'SOR_001',base:'SOR_020',deck:[{id:'SOR_100',count:31}]},cards),{...selection,deck:{unit:31}})
})
