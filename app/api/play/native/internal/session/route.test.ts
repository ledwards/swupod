import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

test('private introspection validates signature, expiry and current account version without trusting a supplied subject',async t=>{
 process.env.DATABASE_URL='postgresql://localhost:1/session_test'
 process.env.PURRGIL_HOST_SERVICE_KEY='k'.repeat(40)
 const id='00000000-0000-4000-8000-000000000001'
 let version=2,reads=0
 t.mock.method(pg.Pool.prototype,'query',async(_sql:string,args:any[])=>{reads++;assert.deepEqual(args,[id]);return {rows:[{id,username:'Current name',avatar_url:null,auth_version:version}]}})
 const {createToken}=await import('@/lib/auth')
 const {POST}=await import('./route')
 const token=createToken({id,username:'Old name',email:'private@example.test',auth_version:2})
 const request=(value:string,key='k'.repeat(40))=>new Request('https://www.protectthepod.com/api/play/native/internal/session',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({token:value,subject:'another-user'})})
 assert.equal((await POST(request(token,'wrong'))).status,401);assert.equal(reads,0)
 assert.equal((await POST(request('forged'))).status,401);assert.equal(reads,0)
 const response=await POST(request(token));assert.equal(response.status,200)
 const result=await response.json();assert.equal(result.subject,id);assert.equal(result.name,'Current name');assert.equal(result.email,undefined);assert.equal(result.token,undefined)
 version=3;assert.equal((await POST(request(token))).status,401)
})
