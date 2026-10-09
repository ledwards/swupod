import test from 'node:test'
import assert from 'node:assert/strict'
import {queueContract,limitedCompatible,contractKey} from './formats'
const c=(limited:string,set='ASH',format='limited')=>queueContract({format,limited,set,pool:'current'})
test('strict queues separate draft, six/eight sealed and sets; Chaos deliberately admits all limited origins',()=>{
 for(const [mode,poolType,packCount] of [['draft','draft',3],['six','sealed',6],['eight','sealed',8]] as const){
  const deck={setCode:'ASH',poolType,packCount}
  for(const candidate of ['draft','six','eight'])assert.equal(limitedCompatible(c(candidate),deck),mode===candidate)
  assert.equal(limitedCompatible(c(mode,'SOR'),deck),false)
  assert.equal(limitedCompatible(c('chaos'),deck),true)
 }
 assert.equal(limitedCompatible(c('chaos'),{setCode:'mixed',poolType:'draft',packCount:3}),true)
 assert.equal(limitedCompatible(c('draft'),{setCode:'ASH',poolType:'draft',packCount:4}),false)
})
test('format and policy contracts reject unoffered inputs and keep Eternal distinct',()=>{
 assert.notEqual(contractKey(c('six','','premier')),contractKey(c('six','','eternal')))
 assert.throws(()=>queueContract({format:'limited',limited:'chaos',pool:'next'}),/not available/)
 assert.throws(()=>queueContract({format:'anything',limited:'chaos',pool:'current'}),/Choose/)
 assert.equal(contractKey(c('chaos','SOR')),contractKey(c('chaos','ASH')))
})
