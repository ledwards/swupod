import {test} from 'node:test'
import assert from 'node:assert/strict'
import {NextResponse} from 'next/server'
import {createToken,clearSession,getSession,getSessionFromCookieHeader,setSession,shareSession} from './auth'

const user={id:'00000000-0000-4000-8000-000000000001',email:'player@example.test',username:'Player',auth_version:2}
test('PTP login emits an HttpOnly parent-domain session without changing the signing boundary',t=>{
 const before=process.env.PTP_PUBLIC_ORIGIN;process.env.PTP_PUBLIC_ORIGIN='https://www.protectthepod.com'
 t.after(()=>{if(before===undefined)delete process.env.PTP_PUBLIC_ORIGIN;else process.env.PTP_PUBLIC_ORIGIN=before})
 const response=setSession(NextResponse.json({ok:true}),user)
 const shared=response.headers.getSetCookie().find(c=>c.startsWith('ptp_session='))!
 assert.ok(shared);assert.match(shared,/Domain=protectthepod.com/);assert.match(shared,/HttpOnly/);assert.match(shared,/Secure/);assert.match(shared,/SameSite=Lax/)
 const cookie=shared.split(';')[0]
 assert.equal(getSession(new Request('https://www.protectthepod.com/api/auth/session',{headers:{cookie}}))?.id,user.id)
 assert.equal(getSessionFromCookieHeader(cookie)?.id,user.id)
 assert.equal(response.headers.get('cache-control'),'no-store')
})
test('shared account switches and logout override an older host-only cookie',()=>{
 const old=createToken(user),fresh=createToken({...user,id:'00000000-0000-4000-8000-000000000002'})
 assert.equal(getSessionFromCookieHeader(`swupod_session=${old}; ptp_session=${fresh}`)?.id,'00000000-0000-4000-8000-000000000002')
 for(const token of ['signed-out','invalid',''])assert.equal(getSessionFromCookieHeader(`swupod_session=${old}; ptp_session=${token}`),null)
 assert.equal(getSessionFromCookieHeader(`ptp_session=${fresh}; ptp_session=${old}`),null)
 const cleared=clearSession(NextResponse.json({ok:true}))
 assert.ok(cleared.headers.getSetCookie().some(c=>c.startsWith('ptp_session=signed-out;')))
 assert.ok(cleared.headers.getSetCookie().some(c=>c.startsWith('swupod_session=;')))
})
test('migration preserves the existing token expiry and legacy sessions remain readable',()=>{
 const token=createToken(user),session=getSessionFromCookieHeader(`swupod_session=${token}`)!
 const migrated=shareSession(new Response(),token).headers.getSetCookie()[0]
 assert.ok(migrated.startsWith(`ptp_session=${token};`))
 assert.ok(Number(migrated.match(/Max-Age=(\d+)/)?.[1])<=session.exp!-Math.floor(Date.now()/1000))
 assert.equal(shareSession(new Response(),'invalid').headers.get('set-cookie'),null)
})
