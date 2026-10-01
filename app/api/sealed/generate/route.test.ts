import { it } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from './route'
it('rejects cross-origin and unauthenticated generation before database writes',async()=>{
  const origin=process.env.PTP_PUBLIC_ORIGIN||'http://localhost:3000'
  const forged=await POST(new Request(`${origin}/api/sealed/generate`,{method:'POST',headers:{origin:'https://elsewhere.invalid'},body:'{}'}))
  assert.equal(forged.status,403)
  const anonymous=await POST(new Request(`${origin}/api/sealed/generate`,{method:'POST',headers:{origin},body:JSON.stringify({action:'prepare',cards:[{id:'forged'}]})}))
  assert.equal(anonymous.status,401)
})
