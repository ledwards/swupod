import { it } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

it('hides native entry routes when rollout is disabled, without hiding legacy exports', () => {
  const previous = process.env.PTP_NATIVE_PLAY_ENABLED
  const maintenance = process.env.MAINTENANCE_MODE
  try {
    process.env.MAINTENANCE_MODE = 'false'
    for (const value of [undefined, 'false']) {
      if (value === undefined) delete process.env.PTP_NATIVE_PLAY_ENABLED
      else process.env.PTP_NATIVE_PLAY_ENABLED = value
      for (const path of ['/play', '/play/native', '/play/test']) {
        const response = proxy(new NextRequest(`https://www.protectthepod.com${path}`))
        assert.equal(response.status, 307)
        assert.equal(response.headers.get('location'), 'https://www.protectthepod.com/')
      }
      assert.equal(proxy(new NextRequest('https://www.protectthepod.com/play/solo')).status, 200)
    }
    process.env.PTP_NATIVE_PLAY_ENABLED = 'true'
    assert.equal(proxy(new NextRequest('http://localhost:3000/play')).status, 200)
  } finally {
    if (previous === undefined) delete process.env.PTP_NATIVE_PLAY_ENABLED
    else process.env.PTP_NATIVE_PLAY_ENABLED = previous
    if (maintenance === undefined) delete process.env.MAINTENANCE_MODE
    else process.env.MAINTENANCE_MODE = maintenance
  }
})
