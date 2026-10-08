import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isProductionAnalyticsHost } from './productionHost'
test('audience analytics exclude local, preview, and lookalike hosts', () => {
  for (const host of ['localhost', '127.0.0.1', 'www.protectthepod.com.evil.test', 'preview.up.railway.app']) {
    assert.equal(isProductionAnalyticsHost(host), false)
  }
  assert.equal(isProductionAnalyticsHost('www.protectthepod.com'), true)
  assert.equal(isProductionAnalyticsHost('protectthepod.com'), true)
})
