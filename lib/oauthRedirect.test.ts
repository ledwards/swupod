import {test} from 'node:test'
import assert from 'node:assert/strict'
import {oauthRedirectUrl} from './oauthRedirect'
test('OAuth success and errors preserve queries and fragments',()=>{
 for(const key of ['auth','error'] as const){
  const url=new URL(oauthRedirectUrl('http://localhost:3000','/play/solo?pool=SmVEtnK-#deck',key,'test value'))
  assert.equal(url.searchParams.get('pool'),'SmVEtnK-')
  assert.equal(url.searchParams.get(key),'test value')
  assert.equal(url.hash,'#deck')
 }
})
