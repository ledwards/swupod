import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fromBaize,fromSwuapi,type SwuapiDecklist} from './aiDeckSources'
import type {LegalityCard} from '../src/services/play/constructedValidation'

const card=(id:string,name:string,type:string,subtitle?:string):LegalityCard=>({id,name,subtitle,type,set:id.slice(0,3),released:true,premier:true})
const catalog=[card('LAW_018','Lando Calrissian','Leader','Full Sabacc'),card('SOR_029','City in the Clouds','Base'),card('LAW_100','Loth-Wolf','Unit'),card('SEC_100','Loth-Wolf','Unit'),card('LAW_200','The Tree Remembers','Event')]
const row=(over:Partial<SwuapiDecklist>={}):SwuapiDecklist=>({uuid:'u1',format:'Premier',tier:'PQ',final_placement:2,archetype_name:'Lando Calrissian, Full Sabacc - Blue 30',tournament_name:'PQ Somewhere',tournament_date:'2026-09-01T00:00:00.000Z',decklist:[
 {name:'Lando Calrissian, Full Sabacc',cardName:'Lando Calrissian',subtitle:'Full Sabacc',type:'Leader',count:1,sideboard:false},
 {name:'City in the Clouds',type:'Base',count:1,sideboard:false},
 {name:'Loth-Wolf',cardName:'Loth-Wolf',subtitle:null,type:'Ground Unit',count:3,sideboard:false},
 {name:'The Tree Remembers',type:'Event',count:2,sideboard:true}],...over})

test('swuapi decklists map names to supported ids, keep top finishes, one per archetype',()=>{
 const decks=fromSwuapi([row(),row({uuid:'u2',final_placement:1}),row({uuid:'u3',final_placement:30,archetype_name:'Other'}),row({uuid:'u4',format:'Eternal'})],catalog,new Set(['SEC_100']))
 assert.deepEqual(decks.map(d=>d.id),['swuapi-u2','swuapi-u4'])
 const d=decks[0]!
 assert.equal(d.leader,'LAW_018');assert.equal(d.base,'SOR_029')
 assert.deepEqual(d.deck,[{id:'SEC_100',count:3}],'the engine-supported reprint wins')
 assert.deepEqual(d.sideboard,[{id:'LAW_200',count:2}])
 assert.equal(d.source.placement,1);assert.equal(d.source.date,'2026-09-01')
 // A card the catalogue cannot name drops the whole list.
 assert.deepEqual(fromSwuapi([row({decklist:[...row().decklist,{name:'Mystery',type:'Event',count:1,sideboard:false}]})],catalog,new Set()),[])
})

test('Baize: real lists use tournament counts and lead; starters and lab decks are not offered',()=>{
 const dir=mkdtempSync(join(tmpdir(),'baize-'))
 writeFileSync(join(dir,'play-decks.json'),JSON.stringify({decks:[{id:'starter-luke',label:'Luke — SOR starter',file:'a.json',key:'luke'},{id:'hmw-tarkin',label:'Grand Moff Tarkin — HMW Spotlight',file:'a.json',key:'tarkin'},{id:'premier-luke',label:'Luke — Premier',file:'a.json',key:'real'},{id:'lab-x',label:'Lab',file:'a.json',key:'tarkin',lab:true}]}))
 writeFileSync(join(dir,'a.json'),JSON.stringify({luke:{leader:'SOR_005',base:'SOR_020',cards:[]},tarkin:{leader:'HMW_004',base:'SEC_022',cards:[{id:'HMW_100',count:50}]},real:{leader:'JTL_012',base:'JTL_024',cards:[{id:'ASH_110',count:4,_real:3},{id:'ASH_153',count:1,_real:3}]}}))
 const decks=fromBaize(dir)
 assert.deepEqual(decks.map(d=>d.id),['baize-premier-luke','baize-hmw-tarkin'])
 assert.deepEqual(decks[0]!.deck,[{id:'ASH_110',count:3},{id:'ASH_153',count:3}])
 assert.equal(decks[0]!.source.kind,'tournament');assert.equal(decks[1]!.source.label,'HMW Spotlight')
})
