import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasEntryAccess } from './access'
test('only beta and admin users receive the new entry flow', () => {
  for (const user of [null, undefined, {}, { is_admin: false, is_beta_tester: false }])
    assert.equal(hasEntryAccess(user), false)
  for (const user of [{ is_beta_tester: true }, { is_admin: true }])
    assert.equal(hasEntryAccess(user), true)
})
