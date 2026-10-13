import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GET,POST} from './[[...path]]/route'

test('homepage bridge restricts paths, checks origin and keeps game links on play',async()=>{
 const original=globalThis.fetch,origin=process.env.PURRGIL_PUBLIC_ORIGIN
 process.env.PURRGIL_PUBLIC_ORIGIN='https://play.example.test'
 let calls=0
 globalThis.fetch=(async(url,options)=>{
  calls++;assert.equal(new URL(String(url)).origin,'https://play.example.test')
  assert.equal(new Headers(options?.headers).get('cookie'),null)
  return Response.json({active:{url:'/table/test/0/'},games:[{url:'/spectate/test/'}],history:[]})
 }) as typeof fetch
 try{
  assert.equal((await GET(new Request('https://ptp.example.test/api/lobby/arbitrary'))).status,404)
  assert.equal((await POST(new Request('https://ptp.example.test/api/lobby/shared',{method:'POST',headers:{origin:'https://evil.example'}}))).status,403)
  assert.equal(calls,0)
  const response=await GET(new Request('https://ptp.example.test/api/lobby',{headers:{cookie:'unrelated=private; ptp_session=invalid'}}))
  const data=await response.json();assert.equal(data.active.url,'https://play.example.test/table/test/0/');assert.equal(data.games[0].url,'https://play.example.test/spectate/test/');assert.equal(response.headers.get('cache-control'),'no-store')
 }finally{globalThis.fetch=original;if(origin===undefined)delete process.env.PURRGIL_PUBLIC_ORIGIN;else process.env.PURRGIL_PUBLIC_ORIGIN=origin}
})

test('FIXED: browser mutations use the configured public origin behind a reverse proxy',async()=>{
 const oldFetch=globalThis.fetch,oldOrigin=process.env.PTP_PUBLIC_ORIGIN
 process.env.PTP_PUBLIC_ORIGIN='https://www.protectthepod.com'
 let calls=0
 globalThis.fetch=async()=>{calls++;return Response.json({valid:true})}
 try {
  const request=(origin:string)=>new Request('http://0.0.0.0:8080/api/lobby/shared',{method:'POST',headers:{origin,'x-forwarded-host':'evil.example','content-type':'application/json'},body:'{"action":"validate"}'})
  assert.equal((await POST(request('https://www.protectthepod.com'))).status,200)
  assert.equal((await POST(request('https://evil.example'))).status,403)
  assert.equal((await POST(request('http://0.0.0.0:8080'))).status,403)
  assert.equal(calls,1)
 }finally{globalThis.fetch=oldFetch;if(oldOrigin===undefined)delete process.env.PTP_PUBLIC_ORIGIN;else process.env.PTP_PUBLIC_ORIGIN=oldOrigin}
})

test('card analysis and individual card requests reach the runtime',async()=>{
 const original=globalThis.fetch
 const paths:string[]=[]
 globalThis.fetch=async(url)=>{paths.push(new URL(String(url)).pathname);return Response.json({games:1,cards:[{id:'HMW_040'}]})}
 try{
  for(const suffix of ['cards','cards/HMW_040']){
   const response=await GET(new Request(`https://ptp.example.test/api/lobby/matches/match-123/${suffix}`))
   assert.equal(response.status,200)
   assert.deepEqual((await response.json()).cards,[{id:'HMW_040'}])
  }
  assert.equal(paths.length,2)
  assert.equal((await GET(new Request('https://ptp.example.test/api/lobby/matches/match-123/cards/HMW_040/extra'))).status,404)
  assert.equal(paths.length,2)
 }finally{globalThis.fetch=original}
})
