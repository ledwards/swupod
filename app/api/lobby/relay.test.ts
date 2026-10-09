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
