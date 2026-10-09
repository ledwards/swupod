import test from 'node:test'
import assert from 'node:assert/strict'
import {cardCatalog,currentPolicy,currentPoolSets} from './cardPool'
import {validateConstructed} from './constructedValidation'
import {getKarabastCardPool} from '../../utils/setConfigs/latest'

// Current matches Karabast: a set joins the pool on retail release day (HMW: 2026-10-09), not at prerelease.
const before=new Date('2026-10-08T23:59:59.999Z')
const release=new Date('2026-10-09T00:00:00.000Z')
test('Homeworlds enters Current on release day, including limited sets and queue policy',()=>{
 assert.equal(currentPoolSets(before).some(c=>c.setCode==='HMW'),false)
 assert.equal(currentPoolSets(new Date('2026-10-02')).some(c=>c.setCode==='HMW'),false,'prerelease does not advance Current')
 assert.equal(currentPoolSets(release)[0].setCode,'HMW')
 assert.notEqual(currentPolicy(before),currentPolicy(release))
 assert.equal(currentPolicy(release),currentPolicy(new Date('2026-10-20')))
 assert.equal(getKarabastCardPool('HMW',before),'Next Set')
 assert.equal(getKarabastCardPool('HMW',release),'Current')
})
test('Victor Squadron is legal in Premier and Eternal from release day onward',()=>{
 const catalog=cardCatalog(release)
 const victor=catalog.find(c=>c.id==='HMW_203')!
 assert.equal(victor.name,'Victor Squadron')
 const units=catalog.filter(c=>c.set==='ASH'&&c.type==='Unit'&&!c.placeholder).filter((c,i,all)=>all.findIndex(other=>other.name===c.name&&other.subtitle===c.subtitle)===i).slice(0,16)
 const deck={leader:'ASH_001',base:'ASH_020',deck:[...units.map(c=>({id:c.id,count:3})),{id:'HMW_203',count:3}]}
 for(const format of ['premier','eternal'] as const){
  assert.throws(()=>validateConstructed(deck,format,cardCatalog(before),{now:before}),/Victor Squadron is not legal/)
  for(const now of [release,new Date('2026-10-20')])assert.doesNotThrow(()=>validateConstructed(deck,format,cardCatalog(now),{now}))
 }
})
