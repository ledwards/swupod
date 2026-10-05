import {test} from 'node:test'
import assert from 'node:assert/strict'
process.env.DISCORD_CLIENT_ID='test-client-id'
process.env.APP_URL='http://localhost:3000'
const {NextRequest}=await import('next/server')
const {createToken}=await import('@/lib/auth')
const {GET}=await import('./route')
const token=createToken({id:'test-user',email:'test@example.com',username:'test',avatar_url:null,is_admin:false,is_beta_tester:false})
test('signed-in redirect preserves the pool, request, and fragment',async()=>{
 const target='/play/solo?pool=SmVEtnK-&request=example#deck'
 const response=await GET(new NextRequest(`http://localhost:3000/api/auth/signin/discord?return_to=${encodeURIComponent(target)}`,{headers:{cookie:`swupod_session=${token}`}}))
 const url=new URL(response.headers.get('location'))
 assert.equal(url.searchParams.get('pool'),'SmVEtnK-')
 assert.equal(url.searchParams.get('request'),'example')
 assert.equal(url.searchParams.get('auth'),'already_logged_in')
 assert.equal(url.hash,'#deck')
})
