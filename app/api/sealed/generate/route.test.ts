import { it } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

process.env.DATABASE_URL ||= 'postgresql://localhost:1/sealed_generate_test'
const { POST } = await import('./route')
const { createToken } = await import('@/lib/auth')

const origin=process.env.PTP_PUBLIC_ORIGIN||'http://localhost:3000'
const request=(headers:Record<string,string>,body:unknown)=>new Request(`${origin}/api/sealed/generate`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)})

it('rejects cross-origin and unauthenticated generation before database writes',async()=>{
  const forged=await POST(request({origin:'https://elsewhere.invalid'},'{}'))
  assert.equal(forged.status,403)
  const anonymous=await POST(request({origin},{action:'prepare',cards:[{id:'forged'}]}))
  assert.equal(anonymous.status,401)
})

it('rejects signed-in non-alpha users (they use the client-side pool flow) and alpha users while the rollout is off',async t=>{
  let writes=0
  t.mock.method(pg.Pool.prototype,'query',async(sql:string)=>{if(!/^\s*SELECT auth_version FROM users/i.test(sql))writes++;return {rows:[{auth_version:1}]}})
  const user={id:'00000000-0000-4000-8000-000000000001',username:'p',email:'p@example.test',auth_version:1}
  const cookie=(extra:Record<string,unknown>)=>`swupod_session=${createToken({...user,...extra})}`
  const beta=await POST(request({origin,cookie:cookie({is_beta_tester:true})},{action:'prepare'}))
  assert.equal(beta.status,403)
  delete process.env.PTP_BETA_EXPERIENCE_ENABLED
  const alphaOff=await POST(request({origin,cookie:cookie({is_alpha_tester:true})},{action:'prepare'}))
  assert.equal(alphaOff.status,403)
  assert.equal(writes,0)
})
