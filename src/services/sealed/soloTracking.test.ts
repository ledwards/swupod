import { it } from 'node:test'
import assert from 'node:assert/strict'
import { trackSoloFinalization } from './soloTracking'
import { LimitedAnalyticsEvents } from '../../analytics/limitedEvents'

it('records the legacy slot/source metadata and one pool-created event across finalize retries',async()=>{
  const records:unknown[]=[];const events:unknown[]=[]
  const deps={track:async(value:unknown)=>{records.push(value)},capture:(...value:unknown[])=>{events.push(value)}}
  const pool={newlyCreated:true,shareId:'saved-pool',setCode:'SOR',packs:[{cards:[{id:'leader'},{id:'base'}]}]}
  await trackSoloFinalization(pool,'pool-id','owner','flow-id',deps)
  await trackSoloFinalization({...pool,newlyCreated:false},'pool-id','owner','flow-id',deps)
  assert.deepEqual(records,[[
    {card:{id:'leader'},options:{packType:'booster',sourceType:'sealed',sourceId:'pool-id',sourceShareId:'saved-pool',packIndex:0,slotType:'leader',userId:'owner'}},
    {card:{id:'base'},options:{packType:'booster',sourceType:'sealed',sourceId:'pool-id',sourceShareId:'saved-pool',packIndex:0,slotType:'base',userId:'owner'}},
  ]])
  assert.deepEqual(events,[[LimitedAnalyticsEvents.LIMITED_POOL_CREATED,'owner',{format:'sealed',mode:'solo',setCode:'SOR',pack_count:1,poolShareId:'saved-pool',flowId:'flow-id'}]])
})
it('tracking failures do not reject finalization or suppress the independent event',async()=>{
  let captured=0
  await assert.doesNotReject(trackSoloFinalization({newlyCreated:true,shareId:'pool',setCode:'SOR',packs:[]},'id','owner',null,{track:async()=>{throw new Error('offline')},capture:()=>{captured++}}))
  assert.equal(captured,1)
})
