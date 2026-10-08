import {test} from 'node:test'
import assert from 'node:assert/strict'
import {requestGameLaunch} from './gameLaunch'
test('retries temporary reservation failures with the same request and accepts a launch once ready',async t=>{
 const requests:string[]=[]
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{
  requests.push(String(options.body))
  if(requests.length===1)return new Response('Bad gateway',{status:502})
  if(requests.length===2)return Response.json({code:'runtime_not_found'},{status:404})
  return Response.json({launchUrl:'https://play.example/launch?code=ready'})
 })
 const body={action:'play',requestId:'same-reservation',poolShareId:'pool'}
 assert.deepEqual(await requestGameLaunch('/launch',body),{launchUrl:'https://play.example/launch?code=ready'})
 assert.deepEqual(requests,Array(3).fill(JSON.stringify(body)))
})
test('never retries access denials or starts another reservation',async t=>{
 let calls=0
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({code:'alpha_required',error:'Access required'},{status:403})})
 await assert.rejects(requestGameLaunch('/launch',{requestId:'same'}),{message:'Access required',code:'alpha_required'})
 assert.equal(calls,1)
})
