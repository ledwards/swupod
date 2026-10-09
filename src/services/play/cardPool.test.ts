import test from 'node:test'
import assert from 'node:assert/strict'
import {cardCatalog,currentPolicy,currentPoolSets} from './cardPool'
import {validateConstructed} from './constructedValidation'
import {getKarabastCardPool} from '../../utils/setConfigs/latest'

const before=new Date('2026-10-01T23:59:59.999Z')
const prerelease=new Date('2026-10-02T00:00:00.000Z')
test('FIXED: Homeworlds enters Current at prerelease, including limited sets and queue policy',()=>{
 assert.equal(currentPoolSets(before).some(c=>c.setCode==='HMW'),false)
 assert.equal(currentPoolSets(prerelease)[0].setCode,'HMW')
 assert.notEqual(currentPolicy(before),currentPolicy(prerelease))
 assert.equal(currentPolicy(prerelease),currentPolicy(new Date('2026-10-09')))
 assert.equal(getKarabastCardPool('HMW',before),'Next Set')
 assert.equal(getKarabastCardPool('HMW',prerelease),'Current')
})
test('FIXED: Victor Squadron is legal in Premier and Eternal from prerelease onward',()=>{
 const catalog=cardCatalog(prerelease)
 const victor=catalog.find(c=>c.id==='HMW_203')!
 assert.equal(victor.name,'Victor Squadron')
 const units=catalog.filter(c=>c.set==='ASH'&&c.type==='Unit'&&!c.placeholder).filter((c,i,all)=>all.findIndex(other=>other.name===c.name&&other.subtitle===c.subtitle)===i).slice(0,16)
 const deck={leader:'ASH_001',base:'ASH_020',deck:[...units.map(c=>({id:c.id,count:3})),{id:'HMW_203',count:3}]}
 for(const format of ['premier','eternal'] as const){
  assert.throws(()=>validateConstructed(deck,format,cardCatalog(before),{now:before}),/Victor Squadron is not legal/)
  for(const now of [prerelease,new Date('2026-10-08'),new Date('2026-10-09')])assert.doesNotThrow(()=>validateConstructed(deck,format,cardCatalog(now),{now}))
 }
})
