import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

const key='k'.repeat(40)
const id='00000000-0000-4000-8000-000000000001'
const request=(body:Record<string,unknown>)=>new Request('https://www.protectthepod.com/api/play/native/internal/shared',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body)})

test('shared play respects the native rollout switch and admits only alpha testers and admins',async t=>{
 process.env.DATABASE_URL='postgresql://localhost:1/shared_test'
 process.env.PURRGIL_HOST_SERVICE_KEY=key
 let user:Record<string,unknown>={id,username:'Player',is_admin:false,is_alpha_tester:false,is_beta_tester:true}
 t.mock.method(pg.Pool.prototype,'query',async()=>({rows:[user]}))
 const {POST}=await import('./route')
 const {sharedIdentity}=await import('@/src/services/play/native/sharedPlay')

 delete process.env.PTP_NATIVE_PLAY_ENABLED
 assert.equal((await POST(request({subject:id,action:'cancel'}))).status,404)

 process.env.PTP_NATIVE_PLAY_ENABLED='true'
 const beta=await POST(request({subject:id,action:'cancel'}))
 assert.equal(beta.status,403)
 assert.equal((await beta.json()).code,'alpha_required')

 user={...user,is_alpha_tester:true,is_beta_tester:false}
 assert.deepEqual(await sharedIdentity(id),{id,name:'Player'})
 user={...user,is_alpha_tester:false,is_admin:true}
 assert.deepEqual(await sharedIdentity(id),{id,name:'Player'})
})
