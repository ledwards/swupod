import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createMeleeConnectionHandler} from './meleeConnectionHandler'
test('connection requests bind to the stored Discord account, ignoring a forged subject',async()=>{
  let called=false
  const handler=createMeleeConnectionHandler({authenticate:()=>({id:'user-a'}),discordForUser:async id=>{assert.equal(id,'user-a');return '100000000000000001'},call:async(subject,input)=>{
    called=true;assert.equal(subject,'100000000000000001');assert.equal(input.discordId,undefined);assert.equal(input.action,'begin');return {status:200,data:{marker:'synthetic-marker'}}
  }})
  const response=await handler(new Request('https://ptp.test/api/connections/melee',{method:'POST',headers:{Origin:'https://ptp.test'},body:JSON.stringify({action:'begin',discordId:'100000000000000002',handle:'example'})}),true)
  assert.equal(response.status,200);assert.equal(called,true)
})
test('cross-origin mutations, absent sessions and malformed input never reach the authority',async()=>{
  const deps={authenticate:()=>({id:'u'}),discordForUser:async()=>'100000000000000001',call:async()=>{throw Error('must not call')}}
  assert.equal((await createMeleeConnectionHandler(deps)(new Request('https://ptp.test/api',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'}),true)).status,403)
  assert.equal((await createMeleeConnectionHandler({...deps,authenticate:()=>{throw Error('Unauthorized')}})(new Request('https://ptp.test/api'),false)).status,401)
  assert.equal((await createMeleeConnectionHandler(deps)(new Request('https://ptp.test/api',{method:'POST',headers:{Origin:'https://ptp.test'},body:'invalid'}),true)).status,400)
})
