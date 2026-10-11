import {test} from 'node:test'
import assert from 'node:assert/strict'
import {callMeleeRewardLink} from './meleeRewardLink'
test('non-JSON upstream errors become a usable service error',async()=>{
 const saved=process.env.PTP_REWARD_LINK_SERVICE_KEY
 process.env.PTP_REWARD_LINK_SERVICE_KEY='x'.repeat(32)
 try {
  const result=await callMeleeRewardLink('100000000000000001',{action:'status'},async()=>new Response('<html>Not found</html>',{status:404}))
  assert.equal(result.status,503)
  assert.match(result.data.error as string,/temporarily unavailable/)
 } finally {if(saved===undefined)delete process.env.PTP_REWARD_LINK_SERVICE_KEY;else process.env.PTP_REWARD_LINK_SERVICE_KEY=saved}
})
