import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasEntryAccess, hasAlphaAccess } from './access'
test('only alpha and admin users receive the new entry flow', () => {
  for (const user of [null, undefined, {}, { is_beta_tester: true }, { is_admin: false, is_beta_tester: false }])
    assert.equal(hasEntryAccess(user), false)
  for (const user of [{ is_alpha_tester: true }, { is_admin: true }])
    assert.equal(hasEntryAccess(user), true)
})

test('alpha is a narrower explicit tier than beta',()=>{
 for(const user of [null,undefined,{}, {is_alpha_tester:false}]) assert.equal(hasAlphaAccess(user),false)
 assert.equal(hasAlphaAccess({is_alpha_tester:true}),true)
 assert.equal(hasAlphaAccess({is_admin:true}),true)
})
